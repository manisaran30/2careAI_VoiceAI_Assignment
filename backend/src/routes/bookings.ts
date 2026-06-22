import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { logger } from '../logger';
import { ensureTableExists } from './slots';

const router = Router();

const VALID_SLOT_TIMES = new Set(['10:00', '11:00', '14:00', '15:00', '16:00']);

// POST /api/bookings/voice-book — Voice agent books appointment (finds/creates patient by phone)
router.post('/voice-book', async (req: Request, res: Response) => {
  try {
    const { patientName, doctorId, branchId, date, time, phone, reason } = req.body;

    if (!patientName || !doctorId || !branchId || !date || !time) {
      return res.status(400).json({
        error: 'patientName, doctorId, branchId, date, and time are required',
      });
    }

    if (!VALID_SLOT_TIMES.has(time)) {
      return res.status(400).json({
        error: `Invalid time. Valid times are: ${Array.from(VALID_SLOT_TIMES).join(', ')}`,
      });
    }

    await ensureTableExists();

    const dateObj = new Date(date + 'T00:00:00.000Z');
    if (isNaN(dateObj.getTime())) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
    }

    const startDate = new Date(dateObj);
    startDate.setUTCHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 1);

    // Find or create patient
    let patient;
    if (phone) {
      patient = await prisma.patient.findUnique({ where: { phone } });
      if (patient) {
        // Update patient name if it was a temporary guest name
        if (patient.name.startsWith('Guest') && patientName && patientName !== patient.name) {
          patient = await prisma.patient.update({
            where: { id: patient.id },
            data: { name: patientName },
          });
        }
      } else {
        patient = await prisma.patient.create({
          data: { name: patientName, phone },
        });
      }
    } else {
      patient = await prisma.patient.findFirst({
        where: { name: patientName },
      });
      if (!patient) {
        return res.status(400).json({
          error: 'Patient not found. Please provide a phone number so we can register you.',
        });
      }
    }

    // Verify doctor and branch exist
    const [doctor, branch] = await Promise.all([
      prisma.doctor.findUnique({ where: { id: doctorId } }),
      prisma.branch.findUnique({ where: { id: branchId } }),
    ]);
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
    if (!branch) return res.status(404).json({ error: 'Branch not found' });

    // Check doctor's available days (stored as JSON string)
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = dayNames[dateObj.getDay()];
    const availableDays: string[] = typeof doctor.availableDays === 'string'
      ? JSON.parse(doctor.availableDays)
      : doctor.availableDays;
    if (!availableDays.includes(dayOfWeek)) {
      return res.status(400).json({
        error: `Dr. ${doctor.name} is not available on ${dayOfWeek}s. Their available days are: ${availableDays.join(', ')}.`,
      });
    }

    // Find available slot
    const slot = await prisma.appointmentSlot.findFirst({
      where: {
        doctorId,
        date: { gte: startDate, lt: endDate },
        time,
        status: 'available',
      },
    });
    if (!slot) {
      return res.status(409).json({
        error: `The ${time} slot on ${date} is not available. Please check availability for other times.`,
      });
    }

    // Create appointment and mark slot booked (atomic, race-condition-safe)
    const appointment = await prisma.$transaction(async (tx) => {
      const updated = await tx.appointmentSlot.updateMany({
        where: { id: slot.id, status: 'available' },
        data: { status: 'booked' },
      });

      if (updated.count === 0) {
        throw new Error('Slot already booked by another request');
      }

      return tx.appointment.create({
        data: {
          patientId: patient.id,
          doctorId,
          branchId,
          date: dateObj,
          time,
          reason: reason || null,
          source: 'ai',
          status: 'scheduled',
        },
        include: {
          patient: { select: { name: true, phone: true } },
          doctor: { select: { name: true, specialty: true } },
          branch: { select: { name: true } },
        },
      });
    });

    logger.info('Bookings.voiceBook', 'Appointment booked via voice', {
      appointmentId: appointment.id,
      doctorId,
      date,
      time,
      patientId: patient.id,
      slotId: slot.id,
    });

    res.status(201).json({
      success: true,
      data: {
        appointment,
        slot: { id: slot.id, time: slot.time, status: 'booked' },
      },
    });
  } catch (error) {
    logger.error('Bookings.voiceBook', 'Failed to book appointment', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /api/bookings/voice-handoff — Request human callback (works without patientId)
router.post('/voice-handoff', async (req: Request, res: Response) => {
  try {
    const { patientName, phone, reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'reason is required' });
    }

    // Look up or create patient
    let patient;
    if (phone) {
      patient = await prisma.patient.findUnique({ where: { phone } });
      if (!patient) {
        patient = await prisma.patient.create({
          data: { name: patientName || `Guest (${phone})`, phone },
        });
      }
    } else if (patientName) {
      patient = await prisma.patient.findFirst({ where: { name: patientName } });
      if (!patient) {
        return res.status(400).json({
          error: 'Patient not found. Please provide your phone number.',
        });
      }
    } else {
      return res.status(400).json({ error: 'patientName or phone is required' });
    }

    const followup = await prisma.humanFollowup.create({
      data: {
        patientId: patient.id,
        reason,
        status: 'pending',
      },
      include: {
        patient: { select: { name: true, phone: true } },
      },
    });

    logger.info('Bookings.voiceHandoff', 'Human handoff requested', {
      followupId: followup.id,
      patientId: patient.id,
      reason,
    });

    res.status(201).json({ success: true, data: followup });
  } catch (error) {
    logger.error('Bookings.voiceHandoff', 'Failed to request handoff', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

export default router;
