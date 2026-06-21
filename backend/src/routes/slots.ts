import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { withRetry } from '../middleware/retry';
import { parseNaturalDate } from '../utils/date-parser';
import { logger } from '../logger';

export async function ensureTableExists(): Promise<boolean> {
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

function getAvailableDays(doc: { availableDays: string | string[] }): string[] {
  if (Array.isArray(doc.availableDays)) return doc.availableDays;
  try {
    const parsed = JSON.parse(doc.availableDays as string);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function checkAvailabilityResponse(doctorId: string, date: string): Promise<{ status: number; body: any }> {
  await ensureTableExists();

  if (!doctorId || !date) {
    return { status: 400, body: { error: 'doctorId and date are required' } };
  }

  logger.info('Slots.availability', `Checking availability`, { doctorId, date });

  const doctor = await prisma.doctor.findUnique({ where: { id: doctorId } });
  if (!doctor) {
    return { status: 404, body: { error: 'Doctor not found', data: [] } };
  }

  const parsed = parseNaturalDate(date);
  const targetDate = parsed.date || date;

  const dateObj = new Date(targetDate + 'T00:00:00.000Z');
  if (isNaN(dateObj.getTime())) {
    return { status: 400, body: { error: parsed.error || `Could not parse date: "${date}". Use YYYY-MM-DD format.` } };
  }

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayOfWeek = dayNames[dateObj.getUTCDay()];

  const availableDays = getAvailableDays(doctor);
  if (!availableDays.includes(dayOfWeek)) {
    return {
      status: 200,
      body: {
        success: true,
        data: [],
        message: `Doctor is not available on ${dayOfWeek}s. Available days: ${availableDays.join(', ')}`,
        doctorId,
        date: targetDate,
      },
    };
  }

  const startDate = new Date(dateObj);
  startDate.setUTCHours(0, 0, 0, 0);
  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + 1);

  const slots = await prisma.appointmentSlot.findMany({
    where: {
      doctorId,
      date: { gte: startDate, lt: endDate },
      status: 'available',
    },
    select: { id: true, time: true, status: true },
    orderBy: { time: 'asc' },
  });

  function to12h(t: string): string {
    const [h, m] = t.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return m === 0 ? `${hour12} ${period}` : `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
  }

  const slotsWithDisplay = slots.map((s) => ({
    ...s,
    displayTime: to12h(s.time),
  }));

  const displayTimes = slotsWithDisplay.map((s) => s.displayTime);

  logger.info('Slots.availability', `Found ${slots.length} available slots`, {
    doctorId,
    date: targetDate,
    dayOfWeek,
    slots: slots.map((s) => s.time),
    displayTimes,
  });

  return {
    status: 200,
    body: {
      success: true,
      data: slotsWithDisplay,
      displayTimes,
      doctorId,
      doctorName: doctor.name,
      date: targetDate,
      dayOfWeek,
    },
  };
}

// GET /api/slots/availability?doctorId=&date= — Get available slots for a doctor on a date
router.get('/availability', async (req: Request, res: Response) => {
  try {
    const { doctorId, date } = req.query;
    const { status, body } = await checkAvailabilityResponse(doctorId as string, date as string);
    res.status(status).json(body);
  } catch (error) {
    logger.error('Slots.availability', 'Failed to check availability', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /api/slots/availability — Same as GET but accepts JSON body (more reliable for Bolna tools)
router.post('/availability', async (req: Request, res: Response) => {
  try {
    const { doctorId, date } = req.body;
    const { status, body } = await checkAvailabilityResponse(doctorId, date);
    res.status(status).json(body);
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
    res.status(500).json({ error: 'Something went wrong.' });
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
