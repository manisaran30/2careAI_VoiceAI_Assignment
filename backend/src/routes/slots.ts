import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { withRetry } from '../middleware/retry';
import { parseNaturalDate } from '../utils/date-parser';
import { logger } from '../logger';

async function ensureTableExists(): Promise<boolean> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "appointment_slots" (
        "id" TEXT PRIMARY KEY,
        "doctorId" TEXT NOT NULL REFERENCES "doctors"("id"),
        "date" TIMESTAMPTZ NOT NULL,
        "time" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'available',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_appointment_slots_doctor_date_status 
      ON "appointment_slots"("doctorId", "date", "status");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_appointment_slots_doctor_date_time 
      ON "appointment_slots"("doctorId", "date", "time");
    `);
    return true;
  } catch (err) {
    logger.error('Slots.ensureTable', 'Failed to create table', { error: String(err) });
    return false;
  }
}

const router = Router();

const SLOT_TIMES = ['10:00', '11:00', '14:00', '15:00', '16:00'];
const VALID_SLOT_TIMES = new Set(SLOT_TIMES);

// GET /api/slots/availability?doctorId=&date= — Get available slots for a doctor on a date
router.get('/availability', async (req: Request, res: Response) => {
  try {
    await ensureTableExists();
    let { doctorId, date } = req.query;

    if (!doctorId || !date) {
      return res.status(400).json({ error: 'doctorId and date are required' });
    }

    const doctorIdStr = doctorId as string;
    const dateStr = date as string;

    logger.info('Slots.availability', `Checking availability`, { doctorId: doctorIdStr, date: dateStr });

    // Verify doctor exists
    const doctor = await prisma.doctor.findUnique({ where: { id: doctorIdStr } });
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found', data: [] });
    }

    // Parse date — support natural language
    const parsed = parseNaturalDate(dateStr);
    const targetDate = parsed.date || dateStr;

    const dateObj = new Date(targetDate + 'T00:00:00.000Z');
    if (isNaN(dateObj.getTime())) {
      return res.status(400).json({ error: parsed.error || 'Invalid date format' });
    }

    // Check if doctor works on this day
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = dayNames[dateObj.getUTCDay()];

    if (!doctor.availableDays.includes(dayOfWeek)) {
      return res.json({
        success: true,
        data: [],
        message: `Doctor is not available on ${dayOfWeek}s`,
        doctorId: doctorIdStr,
        date: targetDate,
      });
    }

    // Query slots from database
    const startDate = new Date(dateObj);
    startDate.setUTCHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 1);

    const slots = await prisma.appointmentSlot.findMany({
      where: {
        doctorId: doctorIdStr,
        date: { gte: startDate, lt: endDate },
        status: 'available',
      },
      select: { id: true, time: true, status: true },
      orderBy: { time: 'asc' },
    });

    logger.info('Slots.availability', `Found ${slots.length} available slots`, {
      doctorId: doctorIdStr,
      date: targetDate,
      dayOfWeek,
      slots: slots.map((s) => s.time),
    });

    res.json({
      success: true,
      data: slots,
      doctorId: doctorIdStr,
      doctorName: doctor.name,
      date: targetDate,
      dayOfWeek,
    });
  } catch (error) {
    logger.error('Slots.availability', 'Failed to check availability', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /api/slots/seed — Generate 7 days of slots for all doctors (admin/debug)
router.post('/seed', async (_req: Request, res: Response) => {
  try {
    // Drop old table if it exists (might have wrong column names from previous deploys)
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "appointment_slots";`);
    await ensureTableExists();
    logger.info('Slots.seed', 'Starting slot generation');
    logger.info('Slots.seed', 'Cleared existing slots');

    const doctors = await prisma.doctor.findMany({ where: { isActive: true } });
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    let totalSlots = 0;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Generate slots for the next 14 days (2 weeks for better coverage)
    for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
      const dateObj = new Date(today);
      dateObj.setUTCDate(dateObj.getUTCDate() + dayOffset);
      const dayOfWeek = dayNames[dateObj.getUTCDay()];

      for (const doctor of doctors) {
        // Skip if doctor doesn't work on this day
        if (!doctor.availableDays.includes(dayOfWeek)) continue;

        const slotData = SLOT_TIMES.map((time) => ({
          doctorId: doctor.id,
          date: dateObj,
          time,
          status: 'available' as const,
        }));

        if (slotData.length > 0) {
          await prisma.appointmentSlot.createMany({ data: slotData });
          totalSlots += slotData.length;
        }
      }
    }

    logger.info('Slots.seed', `Generated ${totalSlots} slots for ${doctors.length} doctors`);

    res.json({
      success: true,
      data: {
        doctorsProcessed: doctors.length,
        slotsGenerated: totalSlots,
        daysGenerated: 14,
        slotTimes: SLOT_TIMES,
      },
    });
  } catch (error) {
    logger.error('Slots.seed', 'Failed to seed slots', { error: String(error) });
    res.status(500).json({ error: String(error) });
  }
});

// POST /api/slots/book — Book a specific slot (alternative to appointments.create)
router.post('/book', async (req: Request, res: Response) => {
  try {
    const { slotId } = req.body;

    if (!slotId) {
      return res.status(400).json({ error: 'slotId is required' });
    }

    const slot = await prisma.appointmentSlot.findUnique({ where: { id: slotId } });
    if (!slot) {
      return res.status(404).json({ error: 'Slot not found' });
    }
    if (slot.status !== 'available') {
      return res.status(409).json({ error: 'Slot is already booked or blocked' });
    }

    await prisma.appointmentSlot.update({
      where: { id: slotId },
      data: { status: 'booked' },
    });

    res.json({
      success: true,
      data: { id: slot.id, doctorId: slot.doctorId, date: slot.date, time: slot.time, status: 'booked' },
    });
  } catch (error) {
    logger.error('Slots.book', 'Failed to book slot', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

export default router;
export { SLOT_TIMES, VALID_SLOT_TIMES };
