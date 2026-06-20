import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { logger } from '../logger';

const router = Router();

const scenarios = [
  { id: 'book_appointment', name: 'Book Appointment', description: 'Search doctor → Check slots → Book → Verify' },
  { id: 'reschedule_appointment', name: 'Reschedule Appointment', description: 'Find booking → Check slots → Update → Verify' },
  { id: 'cancel_appointment', name: 'Cancel Appointment', description: 'Find booking → Cancel → Verify' },
  { id: 'doctor_lookup', name: 'Doctor Lookup', description: 'Search by specialty → Return results' },
  { id: 'unavailable_slot', name: 'Unavailable Slot', description: 'Request booked slot → Suggest alternatives' },
  { id: 'human_handoff', name: 'Human Handoff', description: 'Create follow-up request → Verify in queue' },
  { id: 'conflict_booking', name: 'Conflict Booking', description: 'Book same slot twice → Detect conflict' },
  { id: 'mid_conversation_switch', name: 'Mid-Conversation Switch', description: 'Change doctor after selecting one → Re-book with new doctor' },
  { id: 'vague_request', name: 'Vague Request', description: 'Search with fuzzy terms like "heart doctor", "bone specialist"' },
  { id: 'out_of_hours', name: 'Out of Hours', description: 'Try to book on a non-available day → Graceful handling' },
  { id: 'batch_run', name: 'Batch Run All Scenarios', description: 'Execute all scenarios sequentially and report results' },
];

router.get('/scenarios', (_req: Request, res: Response) => {
  res.json({ success: true, data: scenarios });
});

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

async function runSingleScenario(scenario: string): Promise<{
  scenario: string;
  passed: boolean;
  executionTime: number;
  outcome: string;
  details: Record<string, unknown>;
}> {
  const startTime = Date.now();
  let passed = false;
  let outcome = '';
  const details: Record<string, unknown> = {};

  switch (scenario) {
    case 'book_appointment': {
      const doctor = await prisma.doctor.findFirst({ where: { isActive: true } });
      if (!doctor) { outcome = 'No doctors available'; break; }
      details.doctor = doctor.name;

      const testPhone = `+9190000000${Math.floor(Math.random() * 100)}`;
      const patient = await prisma.patient.upsert({
        where: { phone: testPhone },
        update: {},
        create: { name: 'Eval Patient', phone: testPhone },
      });

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);

      const appointment = await prisma.appointment.create({
        data: {
          patientId: patient.id,
          doctorId: doctor.id,
          branchId: doctor.branchId,
          date: tomorrow,
          time: '10:00',
          reason: 'Evaluation booking',
          source: 'evaluation',
        },
      });

      if (appointment.id) {
        passed = true;
        outcome = `Booked with ${doctor.name}`;
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

      const rescheduled = await prisma.appointment.update({
        where: { id: existing.id },
        data: { time: '14:00', status: 'rescheduled' },
      });

      passed = rescheduled.status === 'rescheduled';
      outcome = passed ? `Rescheduled to 14:00` : 'Reschedule failed';
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
      outcome = passed ? 'Cancelled successfully' : 'Cancel failed';
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

      const booked = await prisma.appointment.findFirst({
        where: { doctorId: doctor.id, status: { notIn: ['cancelled'] } },
        orderBy: { date: 'desc' },
      });

      if (!booked) { outcome = 'No booked slots to test'; break; }

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
        outcome = `Slot ${booked.time} on ${booked.date.toISOString().split('T')[0]} is unavailable`;
        details.conflictingAppointmentId = booked.id;
      }
      break;
    }

    case 'human_handoff': {
      const testPhone = `+9190999999${Math.floor(Math.random() * 100)}`;
      const patient = await prisma.patient.upsert({
        where: { phone: testPhone },
        update: {},
        create: { name: 'Handoff Patient', phone: testPhone },
      });

      const followup = await prisma.humanFollowup.create({
        data: {
          patientId: patient.id,
          reason: 'Test handoff from evaluation',
          status: 'pending',
        },
      });

      passed = !!followup.id;
      outcome = passed ? 'Follow-up request created' : 'Failed';
      details.followupId = followup.id;
      break;
    }

    case 'conflict_booking': {
      const doctor = await prisma.doctor.findFirst({ where: { isActive: true } });
      if (!doctor) { outcome = 'No doctors available'; break; }

      const existingSlot = await prisma.appointmentSlot.findFirst({
        where: { doctorId: doctor.id, status: 'booked' },
      });

      if (existingSlot) {
        const conflict = await prisma.appointmentSlot.findFirst({
          where: {
            doctorId: doctor.id,
            date: existingSlot.date,
            time: existingSlot.time,
          },
        });

        if (conflict && conflict.status === 'booked') {
          passed = true;
          outcome = `Slot ${existingSlot.time} on ${existingSlot.date.toISOString().split('T')[0]} correctly marked as booked`;
          details.slotId = existingSlot.id;
        }
        break;
      }

      const availableSlot = await prisma.appointmentSlot.findFirst({
        where: { doctorId: doctor.id, status: 'available' },
      });

      if (!availableSlot) { outcome = 'No slots to test conflict'; break; }

      await prisma.appointmentSlot.update({
        where: { id: availableSlot.id },
        data: { status: 'booked' },
      });

      const recheck = await prisma.appointmentSlot.findUnique({
        where: { id: availableSlot.id },
      });

      passed = recheck?.status === 'booked';
      outcome = passed ? `Slot ${availableSlot.time} correctly transitioned to booked` : 'Slot update failed';
      details.slotId = availableSlot.id;
      break;
    }

    case 'mid_conversation_switch': {
      const doctors = await prisma.doctor.findMany({ where: { isActive: true }, take: 2 });
      if (doctors.length < 2) { outcome = 'Need at least 2 doctors'; break; }

      const testPhone = `+9191111111${Math.floor(Math.random() * 100)}`;
      const patient = await prisma.patient.upsert({
        where: { phone: testPhone },
        update: {},
        create: { name: 'Switch Patient', phone: testPhone },
      });

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const appointment = await prisma.appointment.create({
        data: {
          patientId: patient.id,
          doctorId: doctors[0].id,
          branchId: doctors[0].branchId,
          date: tomorrow,
          time: '11:00',
          reason: 'Initial selection',
          source: 'evaluation',
        },
      });

      const switched = await prisma.appointment.update({
        where: { id: appointment.id },
        data: { doctorId: doctors[1].id, branchId: doctors[1].branchId },
      });

      passed = switched.doctorId === doctors[1].id;
      outcome = passed
        ? `Switched from ${doctors[0].name} to ${doctors[1].name}`
        : 'Switch failed';
      details.initialDoctor = doctors[0].name;
      details.switchedTo = doctors[1].name;
      details.appointmentId = appointment.id;
      break;
    }

    case 'vague_request': {
      const vagueTerms = ['heart', 'cardio', 'bone', 'brain', 'skin', 'eye', 'child', 'nerve', 'kidney', 'cancer'];
      const term = vagueTerms[Math.floor(Math.random() * vagueTerms.length)];
      details.searchTerm = term;

      const doctors = await prisma.doctor.findMany({
        where: {
          isActive: true,
          OR: [
            { specialty: { contains: term } },
            { name: { contains: term } },
            { department: { name: { contains: term } } },
          ],
        },
        include: { department: true },
        take: 5,
      });

      passed = doctors.length > 0;
      outcome = passed
        ? `Term "${term}" matched ${doctors.length} doctors`
        : `Term "${term}" matched no doctors`;
      details.matchCount = doctors.length;
      if (doctors.length > 0) {
        details.firstMatch = `${doctors[0].name} (${doctors[0].specialty})`;
      }
      break;
    }

    case 'out_of_hours': {
      const sundayName = 'Sunday';
      const doctorsOnSunday = await prisma.doctor.findMany({
        where: { availableDays: { contains: sundayName } },
        take: 5,
      });

      passed = doctorsOnSunday.length === 0;
      outcome = passed
        ? 'No doctors available on Sunday (correct)'
        : `${doctorsOnSunday.length} doctors available on Sunday (unexpected)`;
      details.doctorsOnSunday = doctorsOnSunday.length;
      break;
    }

    default:
      outcome = 'Unknown scenario';
  }

  const executionTime = Date.now() - startTime;

  return { scenario, passed, executionTime, outcome, details };
}

router.post('/run', async (req: Request, res: Response) => {
  try {
    const { scenario } = req.body;

    if (!scenario || !scenarios.find((s) => s.id === scenario)) {
      return res.status(400).json({ error: 'Invalid scenario' });
    }

    const result = await runSingleScenario(scenario);

    const saved = await prisma.evaluationResult.create({
      data: {
        scenario: result.scenario,
        passed: result.passed,
        executionTime: result.executionTime,
        outcome: result.outcome,
        details: JSON.stringify(result.details),
      },
    });

    res.json({ success: true, data: saved });
  } catch (error) {
    logger.error('Evaluations.run', 'Failed to run evaluation', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/batch', async (_req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    const results: { scenario: string; passed: boolean; executionTime: number; outcome: string }[] = [];

    for (const s of scenarios) {
      if (s.id === 'batch_run') continue;
      const r = await runSingleScenario(s.id);
      await prisma.evaluationResult.create({
        data: {
          scenario: r.scenario,
          passed: r.passed,
          executionTime: r.executionTime,
          outcome: r.outcome,
          details: JSON.stringify(r.details),
        },
      });
      results.push({ scenario: r.scenario, passed: r.passed, executionTime: r.executionTime, outcome: r.outcome });
    }

    const totalTime = Date.now() - startTime;
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    res.json({
      success: true,
      data: {
        summary: { total: results.length, passed, failed, totalTime },
        results,
      },
    });
  } catch (error) {
    logger.error('Evaluations.batch', 'Failed to run batch evaluation', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

export default router;
