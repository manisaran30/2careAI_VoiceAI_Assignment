import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { logger } from '../logger';
import { ensureTableExists, SLOT_TIMES } from './slots';

const router = Router();

// GET /api/appointments - List appointments (optional filters: phone, name, date, status)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { phone, name, date, status } = req.query;

    const where: Record<string, unknown> = {};

    if (phone) {
      const patient = await prisma.patient.findUnique({ where: { phone: phone as string } });
      if (patient) {
        where.patientId = patient.id;
      } else {
        return res.json({ success: true, data: [] });
      }
    } else if (name) {
      const patient = await prisma.patient.findFirst({ where: { name: name as string } });
      if (patient) {
        where.patientId = patient.id;
      } else {
        return res.json({ success: true, data: [] });
      }
    }

    if (date) {
      const startDate = new Date(date as string + 'T00:00:00.000Z');
      const endDate = new Date(startDate);
      endDate.setUTCDate(endDate.getUTCDate() + 1);
      where.date = { gte: startDate, lt: endDate };
    }

    if (status) {
      where.status = status;
    }

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        patient: { select: { id: true, name: true, phone: true } },
        doctor: { select: { id: true, name: true, specialty: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: { date: 'desc' },
    });

    res.json({ success: true, data: appointments });
  } catch (error) {
    logger.error('Appointments.list', 'Failed to fetch appointments', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// GET /api/appointments/slots?doctorId=&date= - Get available slots for a doctor on a date
router.get('/slots', async (req: Request, res: Response) => {
  try {
    const { doctorId, date } = req.query;

    if (!doctorId || !date) {
      return res.status(400).json({ error: 'doctorId and date are required' });
    }

    const doctor = await prisma.doctor.findUnique({ where: { id: doctorId as string } });
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    // Get day of week
    const dateObj = new Date(date as string);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = dayNames[dateObj.getDay()];

    // Check if doctor is available on this day
    if (!doctor.availableDays.includes(dayOfWeek)) {
      return res.json({ success: true, data: [], message: 'Doctor not available on this day' });
    }

    const allSlots: string[] = [...SLOT_TIMES];

    // Fetch booked appointments for this doctor on this date
    const startDate = new Date(date as string + 'T00:00:00.000Z');
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 1);

    const bookedAppointments = await prisma.appointment.findMany({
      where: {
        doctorId: doctorId as string,
        date: { gte: startDate, lt: endDate },
        status: { notIn: ['cancelled'] },
      },
      select: { time: true },
    });

    const bookedTimes = new Set(bookedAppointments.map((a) => a.time));
    const availableSlots = allSlots.filter((slot) => !bookedTimes.has(slot));

    res.json({ success: true, data: availableSlots });
  } catch (error) {
    logger.error('Appointments.slots', 'Failed to fetch slots', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /api/appointments - Create appointment
router.post('/', async (req: Request, res: Response) => {
  try {
    const { patientId, doctorId, branchId, date, time, reason, source, callLogId } = req.body;

    if (!patientId || !doctorId || !branchId || !date || !time) {
      return res.status(400).json({ error: 'patientId, doctorId, branchId, date, and time are required' });
    }

    const dateObj = new Date(date as string + 'T00:00:00.000Z');
    const startDate = new Date(dateObj);
    startDate.setUTCHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 1);

    await ensureTableExists();

    // Find an available slot in the database
    const slot = await prisma.appointmentSlot.findFirst({
      where: {
        doctorId,
        date: { gte: startDate, lt: endDate },
        time,
        status: 'available',
      },
    });

    if (!slot) {
      return res.status(409).json({ error: 'Slot is not available. Please check availability first.' });
    }

    // Verify related entities exist
    const [patient, doctor, branch] = await Promise.all([
      prisma.patient.findUnique({ where: { id: patientId } }),
      prisma.doctor.findUnique({ where: { id: doctorId } }),
      prisma.branch.findUnique({ where: { id: branchId } }),
    ]);

    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
    if (!branch) return res.status(404).json({ error: 'Branch not found' });

    // Create appointment and mark slot as booked (atomic via transaction)
    const [appointment] = await prisma.$transaction([
      prisma.appointment.create({
        data: {
          patientId,
          doctorId,
          branchId,
          date: dateObj,
          time,
          reason: reason || null,
          source: source || 'ai',
          callLogId: callLogId || null,
          status: 'scheduled',
        },
        include: {
          patient: { select: { name: true, phone: true } },
          doctor: { select: { name: true, specialty: true } },
          branch: { select: { name: true } },
        },
      }),
      prisma.appointmentSlot.update({
        where: { id: slot.id },
        data: { status: 'booked' },
      }),
    ]);

    logger.info('Appointments.create', 'Appointment created and slot booked', {
      appointmentId: appointment.id,
      doctorId,
      date,
      time,
      slotId: slot.id,
    });

    res.status(201).json({ success: true, data: appointment });
  } catch (error) {
    logger.error('Appointments.create', 'Failed to create appointment', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// PATCH /api/appointments/:id/reschedule - Reschedule appointment
router.patch('/:id/reschedule', async (req: Request, res: Response) => {
  try {
    const { date, time } = req.body;
    if (!date || !time) {
      return res.status(400).json({ error: 'date and time are required' });
    }

    const appointment = await prisma.appointment.findUnique({ where: { id: req.params.id } });
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    if (appointment.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot reschedule a cancelled appointment' });
    }

    const dateObj = new Date(date as string + 'T00:00:00.000Z');
    const startDate = new Date(dateObj);
    startDate.setUTCHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 1);

    const existing = await prisma.appointment.findFirst({
      where: {
        doctorId: appointment.doctorId,
        time,
        date: { gte: startDate, lt: endDate },
        status: { notIn: ['cancelled'] },
        id: { not: appointment.id },
      },
    });

    if (existing) {
      return res.status(409).json({ error: 'Slot is already booked' });
    }

    const updated = await prisma.appointment.update({
      where: { id: req.params.id },
      data: {
        date: dateObj,
        time,
        status: 'rescheduled',
      },
      include: {
        patient: { select: { name: true, phone: true } },
        doctor: { select: { name: true, specialty: true } },
        branch: { select: { name: true } },
      },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    logger.error('Appointments.reschedule', 'Failed to reschedule appointment', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// PATCH /api/appointments/:id/cancel - Cancel appointment
router.patch('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const appointment = await prisma.appointment.findUnique({ where: { id: req.params.id } });
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    if (appointment.status === 'cancelled') {
      return res.status(400).json({ error: 'Appointment is already cancelled' });
    }

    const updated = await prisma.appointment.update({
      where: { id: req.params.id },
      data: { status: 'cancelled' },
      include: {
        patient: { select: { name: true, phone: true } },
        doctor: { select: { name: true, specialty: true } },
      },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    logger.error('Appointments.cancel', 'Failed to cancel appointment', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// PATCH /api/appointments/:id/status - Update appointment status
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const validStatuses = ['scheduled', 'completed', 'cancelled', 'rescheduled', 'no_show'];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
    }

    const appointment = await prisma.appointment.findUnique({ where: { id: req.params.id } });
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const updated = await prisma.appointment.update({
      where: { id: req.params.id },
      data: { status },
      include: {
        patient: { select: { name: true, phone: true } },
        doctor: { select: { name: true, specialty: true } },
      },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    logger.error('Appointments.updateStatus', 'Failed to update appointment status', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

export default router;
