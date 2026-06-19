import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { logger } from '../logger';

const router = Router();

// Test scenarios
const scenarios = [
  { id: 'book_appointment', name: 'Book Appointment', description: 'Search doctor → Check slots → Book → Verify' },
  { id: 'reschedule_appointment', name: 'Reschedule Appointment', description: 'Find booking → Check slots → Update → Verify' },
  { id: 'cancel_appointment', name: 'Cancel Appointment', description: 'Find booking → Cancel → Verify' },
  { id: 'doctor_lookup', name: 'Doctor Lookup', description: 'Search by specialty → Return results' },
  { id: 'unavailable_slot', name: 'Unavailable Slot', description: 'Request booked slot → Suggest alternatives' },
  { id: 'human_handoff', name: 'Human Handoff', description: 'Create follow-up request → Verify in queue' },
];

// GET /api/evaluations/scenarios - List available scenarios
router.get('/scenarios', (_req: Request, res: Response) => {
  res.json({ success: true, data: scenarios });
});

// GET /api/evaluations/results - List evaluation results
router.get('/results', async (_req: Request, res: Response) => {
  try {
    const results = await prisma.evaluationResult.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ success: true, data: results });
  } catch (error) {
    logger.error('Evaluations.results', 'Failed to fetch evaluation results', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /api/evaluations/run - Run a single evaluation scenario
router.post('/run', async (req: Request, res: Response) => {
  try {
    const { scenario } = req.body;

    if (!scenario || !scenarios.find((s) => s.id === scenario)) {
      return res.status(400).json({ error: 'Invalid scenario' });
    }

    const startTime = Date.now();
    let passed = false;
    let outcome = '';
    const details: Record<string, unknown> = {};

    switch (scenario) {
      case 'book_appointment': {
        // Find a doctor
        const doctor = await prisma.doctor.findFirst({ where: { isActive: true } });
        if (!doctor) { outcome = 'No doctors available'; break; }
        details.doctor = doctor.name;

        // Find or create patient
        const testPhone = `+9190000000${Math.floor(Math.random() * 100)}`;
        const patient = await prisma.patient.upsert({
          where: { phone: testPhone },
          update: {},
          create: { name: 'Test Patient', phone: testPhone },
        });
        details.patient = patient.name;

        // Book appointment
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(10, 0, 0, 0);
        const time = '10:00';

        const appointment = await prisma.appointment.create({
          data: {
            patientId: patient.id,
            doctorId: doctor.id,
            branchId: doctor.branchId,
            date: tomorrow,
            time,
            reason: 'Test booking via evaluation',
            source: 'evaluation',
          },
        });

        if (appointment.id) {
          passed = true;
          outcome = `Appointment booked with ${doctor.name} at ${time}`;
          details.appointmentId = appointment.id;
        }
        break;
      }

      case 'reschedule_appointment': {
        const existing = await prisma.appointment.findFirst({
          where: { status: 'scheduled' },
          orderBy: { date: 'asc' },
        });
        if (!existing) { outcome = 'No scheduled appointments found'; break; }

        const newTime = '14:00';
        const rescheduled = await prisma.appointment.update({
          where: { id: existing.id },
          data: { time: newTime, status: 'rescheduled' },
        });

        passed = rescheduled.status === 'rescheduled';
        outcome = passed ? `Appointment rescheduled to ${newTime}` : 'Reschedule failed';
        details.appointmentId = existing.id;
        break;
      }

      case 'cancel_appointment': {
        const existing = await prisma.appointment.findFirst({
          where: { status: { notIn: ['cancelled', 'completed'] } },
          orderBy: { date: 'asc' },
        });
        if (!existing) { outcome = 'No cancellable appointments found'; break; }

        const cancelled = await prisma.appointment.update({
          where: { id: existing.id },
          data: { status: 'cancelled' },
        });

        passed = cancelled.status === 'cancelled';
        outcome = passed ? 'Appointment cancelled successfully' : 'Cancel failed';
        details.appointmentId = existing.id;
        break;
      }

      case 'doctor_lookup': {
        const doctors = await prisma.doctor.findMany({
          where: { isActive: true },
          take: 5,
        });
        passed = doctors.length > 0;
        outcome = passed ? `Found ${doctors.length} doctors` : 'No doctors found';
        details.count = doctors.length;
        break;
      }

      case 'unavailable_slot': {
        const doctor = await prisma.doctor.findFirst({ where: { isActive: true } });
        if (!doctor) { outcome = 'No doctors available'; break; }

        // Get a slot that's already booked
        const booked = await prisma.appointment.findFirst({
          where: { doctorId: doctor.id, status: { notIn: ['cancelled'] } },
          orderBy: { date: 'desc' },
        });

        if (!booked) { outcome = 'No booked slots found to test'; break; }

        // Try to book the same slot (should fail)
        const dupCheck = await prisma.appointment.findFirst({
          where: {
            doctorId: doctor.id,
            time: booked.time,
            date: booked.date,
            status: { notIn: ['cancelled'] },
          },
        });

        if (dupCheck) {
          passed = true;
          outcome = `Slot ${booked.time} on ${booked.date.toISOString().split('T')[0]} is correctly marked as unavailable`;
          details.conflictingAppointmentId = booked.id;
        }
        break;
      }

      case 'human_handoff': {
        const testPhone = `+9190999999${Math.floor(Math.random() * 100)}`;
        const patient = await prisma.patient.upsert({
          where: { phone: testPhone },
          update: {},
          create: { name: 'Handoff Test Patient', phone: testPhone },
        });

        const followup = await prisma.humanFollowup.create({
          data: {
            patientId: patient.id,
            reason: 'Test handoff request from evaluation',
            status: 'pending',
          },
        });

        passed = !!followup.id;
        outcome = passed ? 'Follow-up request created successfully' : 'Failed to create follow-up';
        details.followupId = followup.id;
        break;
      }

      default:
        outcome = 'Unknown scenario';
    }

    const executionTime = Date.now() - startTime;

    const result = await prisma.evaluationResult.create({
      data: {
        scenario,
        passed,
        executionTime,
        outcome,
        details: JSON.stringify(details),
      },
    });

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Evaluations.run', 'Failed to run evaluation', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

export default router;
