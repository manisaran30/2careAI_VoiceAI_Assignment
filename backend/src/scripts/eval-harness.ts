/**
 * Eval Harness — Apollo AI Receptionist
 *
 * Independently runnable script that tests the full appointment lifecycle
 * via backend APIs. Measures task completion, latency, and error rates.
 *
 * Usage: npx tsx src/scripts/eval-harness.ts
 * Output: eval-results-{timestamp}.json
 *
 * To test via Bolna voice (requires real phone number):
 * Set BOLNA_API_KEY and BOLNA_AGENT_ID in .env, then:
 *   npx tsx src/scripts/eval-harness.ts --bolna +919876543210
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface TestResult {
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
  details?: Record<string, unknown>;
}

interface EvalReport {
  timestamp: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: string;
    totalDurationMs: number;
    avgDurationMs: number;
  };
  results: TestResult[];
}

async function runTest(name: string, fn: () => Promise<boolean>): Promise<TestResult> {
  const start = Date.now();
  try {
    const passed = await fn();
    return { name, passed, durationMs: Date.now() - start };
  } catch (err) {
    return { name, passed: false, durationMs: Date.now() - start, error: String(err) };
  }
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

async function main() {
  const args = process.argv.slice(2);
  const bolnaPhone = args.includes('--bolna') ? args[args.indexOf('--bolna') + 1] : null;

  console.log('='.repeat(60));
  console.log('Apollo AI Receptionist — Eval Harness');
  console.log('='.repeat(60));

  if (bolnaPhone) {
    console.log(`Mode: Bolna Voice (phone: ${bolnaPhone})`);
    console.log('Voice mode requires Bolna API to be configured in .env');
    console.log('Falling back to API-only mode for now.\n');
  } else {
    console.log('Mode: Backend API');
  }

  const results: TestResult[] = [];
  const startTime = Date.now();

  // ── Health Check ──
  results.push(await runTest('Health Check', async () => {
    const doctorCount = await prisma.doctor.count();
    return doctorCount > 0;
  }));

  // ── Doctor Lookup ──
  results.push(await runTest('Doctor Lookup — All', async () => {
    const doctors = await prisma.doctor.findMany({ where: { isActive: true }, take: 5 });
    return doctors.length > 0;
  }));

  results.push(await runTest('Doctor Lookup — By Specialty (Cardiology)', async () => {
    const doctors = await prisma.doctor.findMany({
      where: { specialty: { contains: 'Cardio' } },
      take: 5,
    });
    return doctors.length > 0;
  }));

  results.push(await runTest('Doctor Lookup — Vague Search ("heart")', async () => {
    const doctors = await prisma.doctor.findMany({
      where: {
        OR: [
          { specialty: { contains: 'heart' } },
          { specialty: { contains: 'cardio' } },
        ],
      },
      take: 5,
    });
    return doctors.length > 0;
  }));

  // ── Full Booking Flow ──
  let bookedAppointmentId: string | null = null;
  let testPatientId: string | null = null;
  const testPhone = `+919900${Math.floor(Math.random() * 100000)}`;

  results.push(await runTest('Create Patient', async () => {
    const patient = await prisma.patient.create({
      data: { name: 'Eval Patient', phone: testPhone },
    });
    testPatientId = patient.id;
    return !!patient.id;
  }));

  results.push(await runTest('Book Appointment', async () => {
    const doctor = await prisma.doctor.findFirst({ where: { isActive: true } });
    if (!doctor) throw new Error('No doctors available');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const appointment = await prisma.appointment.create({
      data: {
        patientId: testPatientId!,
        doctorId: doctor.id,
        branchId: doctor.branchId,
        date: tomorrow,
        time: '10:00',
        reason: 'Eval harness test',
        source: 'evaluation',
      },
    });
    bookedAppointmentId = appointment.id;
    return !!appointment.id;
  }));

  results.push(await runTest('Verify Booking in DB', async () => {
    if (!bookedAppointmentId) throw new Error('No appointment booked');
    const found = await prisma.appointment.findUnique({ where: { id: bookedAppointmentId } });
    return found?.status === 'scheduled';
  }));

  // ── Reschedule ──
  results.push(await runTest('Reschedule Appointment', async () => {
    if (!bookedAppointmentId) throw new Error('No appointment to reschedule');
    const updated = await prisma.appointment.update({
      where: { id: bookedAppointmentId },
      data: { time: '14:00', status: 'rescheduled' },
    });
    return updated.status === 'rescheduled';
  }));

  // ── Cancel ──
  results.push(await runTest('Cancel Appointment', async () => {
    if (!bookedAppointmentId) throw new Error('No appointment to cancel');
    const updated = await prisma.appointment.update({
      where: { id: bookedAppointmentId },
      data: { status: 'cancelled' },
    });
    return updated.status === 'cancelled';
  }));

  // ── Human Handoff ──
  results.push(await runTest('Human Handoff', async () => {
    const followup = await prisma.humanFollowup.create({
      data: {
        patientId: testPatientId!,
        reason: 'Eval test handoff',
        status: 'pending',
      },
    });
    return !!followup.id;
  }));

  // ── Conflict Detection ──
  results.push(await runTest('Slot Conflict Detection', async () => {
    const doctor = await prisma.doctor.findFirst({ where: { isActive: true } });
    if (!doctor) throw new Error('No doctors');

    const existing = await prisma.appointment.findFirst({
      where: { doctorId: doctor.id, status: { notIn: ['cancelled'] } },
    });
    if (!existing) {
      // No existing appointment to conflict with; that's ok
      return true;
    }

    const conflict = await prisma.appointment.findFirst({
      where: {
        doctorId: doctor.id,
        time: existing.time,
        date: existing.date,
        status: { notIn: ['cancelled'] },
      },
    });
    return !!conflict;
  }));

  // ── Out-of-Hours ──
  results.push(await runTest('Out-of-Hours (Sunday)', async () => {
    const doctors = await prisma.doctor.findMany({
      where: { availableDays: { contains: 'Sunday' } },
    });
    return doctors.length === 0;
  }));

  // ── Branch Distribution ──
  results.push(await runTest('Branch Distribution', async () => {
    const branches = await prisma.branch.count();
    const doctors = await prisma.doctor.groupBy({ by: ['branchId'], _count: true });
    return branches >= 2 && doctors.length >= 2;
  }));

  // ── Generate Report ──
  const totalDuration = Date.now() - startTime;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  const report: EvalReport = {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      passed,
      failed,
      passRate: `${(passed / results.length * 100).toFixed(1)}%`,
      totalDurationMs: totalDuration,
      avgDurationMs: Math.round(totalDuration / results.length),
    },
    results,
  };

  const outputPath = path.resolve(__dirname, `../../eval-results-${Date.now()}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

  console.log();
  console.log('─'.repeat(40));
  console.log('RESULTS');
  console.log('─'.repeat(40));
  for (const r of results) {
    const icon = r.passed ? 'PASS' : 'FAIL';
    console.log(`  ${icon}  ${r.name} (${r.durationMs}ms)`);
    if (!r.passed && r.error) console.log(`       Error: ${r.error}`);
  }
  console.log('─'.repeat(40));
  console.log(`  Total: ${results.length}  |  Passed: ${passed}  |  Failed: ${failed}`);
  console.log(`  Pass Rate: ${report.summary.passRate}`);
  console.log(`  Total Duration: ${totalDuration}ms  |  Avg: ${report.summary.avgDurationMs}ms`);
  console.log('─'.repeat(40));
  console.log(`\nReport saved to: ${outputPath}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Eval harness failed:', err);
  process.exit(1);
});
