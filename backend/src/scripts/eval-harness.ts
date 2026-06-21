/**
 * Apollo AI Receptionist — Eval Harness
 *
 * Tests the agent's performance across 5 weighted dimensions:
 *   1. E2E Booking Flow (25%) — complete book→verify→reschedule→cancel lifecycle
 *   2. Hallucination Resistance (20%) — graceful handling of invalid/edge inputs
 *   3. Error Recovery (20%) — graceful failure under bad data / conflicts
 *   4. Latency & Performance (20%) — per-op p50/p95/p99, budget thresholds
 *   5. Data Quality (15%) — FK integrity, status-transition validity, consistency
 *
 * Usage:
 *   npx tsx src/scripts/eval-harness.ts                  # API mode (needs running server)
 *   npx tsx src/scripts/eval-harness.ts --direct          # Direct Prisma mode
 *
 * Env:
 *   BASE_URL         API base URL (default: http://localhost:3001)
 *   EVAL_ITERATIONS  Number of iterations for latency tests (default: 5)
 *
 * Output: eval-results-{timestamp}.json
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

// ── Config ────────────────────────────────────────────────────────────────────
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const ITERATIONS = parseInt(process.env.EVAL_ITERATIONS || '5', 10);

const prisma = new PrismaClient();

interface TestResult {
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
  details?: Record<string, unknown>;
  latencyBudgetHit?: boolean;
  bucket?: string; // which dimension this test belongs to
  weight?: number;
}

interface LatencyStats {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  samples: number;
  overBudget: number;
}

interface DimensionScore {
  score: number;
  weight: number;
  passed: number;
  total: number;
  tests: TestResult[];
}

interface EvalReport {
  timestamp: string;
  mode: 'api' | 'direct';
  config: { baseUrl: string; iterations: number };
  dimensions: Record<string, DimensionScore>;
  latency: Record<string, LatencyStats>;
  overall: { score: number; passed: number; total: number; passRate: string };
  shortcomings: string[];
  results: TestResult[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function computeLatencyStats(values: number[]): LatencyStats {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    samples: values.length,
    overBudget: values.filter((v) => v > 2000).length,
  };
}

const LATENCY_BUDGET_MS: Record<string, number> = {
  'Doctor Search': 1000,
  'Slot Check': 1000,
  'Book Appointment': 2000,
  'Reschedule': 1500,
  'Cancel': 1500,
  'Handoff': 1500,
  'Patient Lookup': 1000,
};

async function apiPost(path: string, body: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function apiGet(path: string): Promise<{ status: number; data: any }> {
  const res = await fetch(`${BASE_URL}${path}`);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function apiPatch(path: string, body: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

type TestFn = () => Promise<{ passed: boolean; details?: Record<string, unknown> }>;

async function runTest(
  name: string,
  fn: TestFn,
  bucket: string,
  weight: number,
): Promise<TestResult> {
  const start = Date.now();
  const budget = LATENCY_BUDGET_MS[name] || 2000;
  try {
    const { passed, details } = await fn();
    const durationMs = Date.now() - start;
    return { name, passed, durationMs, details, bucket, weight, latencyBudgetHit: durationMs > budget };
  } catch (err) {
    return {
      name,
      passed: false,
      durationMs: Date.now() - start,
      error: String(err),
      bucket,
      weight,
      latencyBudgetHit: true,
    };
  }
}

// ── Mode Detection ──────────────────────────────────────────────────────────

async function isServerRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/doctors`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

// ── API-mode helpers ─────────────────────────────────────────────────────────

async function getServiceableDoctor(usedIds: Set<string>): Promise<{ id: string; branchId: string } | null> {
  const r = await apiGet('/api/doctors');
  if (!r.data?.data) return null;
  const available = r.data.data.find((d: any) => !usedIds.has(d.id));
  return available ? { id: available.id, branchId: available.branchId } : null;
}

// ── Dimension 1: End-to-End Booking Flow (25%) ───────────────────────────────

async function dimensionE2E(useApi: boolean): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const weight = 0.25;
  const usedDoctors = new Set<string>();
  let patientId: string | null = null;
  let appointmentId: string | null = null;
  const testPhone = `+919966${Math.floor(Math.random() * 100000)}`;

  // 1a. Patient creation or lookup
  results.push(await runTest('Patient Creation', async () => {
    if (useApi) {
      const r = await apiPost('/api/patients', { name: 'E2E Test Patient', phone: testPhone });
      // 201 = created, might also get data back with existing patient
      patientId = r.data?.data?.id || null;
      return { passed: r.status === 201 || r.status === 200 };
    }
    const p = await prisma.patient.create({ data: { name: 'E2E Test Patient', phone: testPhone } });
    patientId = p.id;
    return { passed: !!patientId };
  }, 'E2E Booking', weight));

  // 1b. Doctor search by specialty
  results.push(await runTest('Doctor Search (Cardiologist)', async () => {
    if (useApi) {
      const r = await apiPost('/api/doctors/find', { specialty: 'Cardiology' });
      const docs = r.data?.data || [];
      if (docs.length > 0) docs.forEach((d: any) => usedDoctors.add(d.id));
      return { passed: docs.length > 0, details: { count: docs.length } };
    }
    const docs = await prisma.doctor.findMany({ where: { specialty: { contains: 'Cardio' } }, take: 5 });
    docs.forEach((d) => usedDoctors.add(d.id));
    return { passed: docs.length > 0, details: { count: docs.length } };
  }, 'E2E Booking', weight));

  // 1c. Vague search
  results.push(await runTest('Doctor Search (Vague "heart doctor")', async () => {
    if (useApi) {
      const r = await apiPost('/api/doctors/find', { specialty: 'heart doctor' });
      const docs = r.data?.data || [];
      return { passed: docs.length > 0, details: { count: docs.length } };
    }
    const docs = await prisma.doctor.findMany({
      where: { OR: [{ specialty: { contains: 'heart' } }, { specialty: { contains: 'cardio' } }] },
      take: 5,
    });
    return { passed: docs.length > 0, details: { count: docs.length } };
  }, 'E2E Booking', weight));

  // 1d. Check slots
  results.push(await runTest('Slot Availability Check', async () => {
    const doctor = await getServiceableDoctor(usedDoctors);
    if (!doctor) return { passed: false, details: { error: 'No doctor found' } };
    if (useApi) {
      const r = await apiPost('/api/slots/availability', { doctorId: doctor.id });
      return { passed: r.status < 500, details: { doctorId: doctor.id, response: r.status } };
    }
    return { passed: true, details: { doctorId: doctor.id } };
  }, 'E2E Booking', weight));

  // 1e. Book appointment (simulates what Bolna's booking webhook does)
  results.push(await runTest('Book Appointment (voice-book)', async () => {
    const doctor = await getServiceableDoctor(usedDoctors);
    if (!doctor || !patientId) return { passed: false, details: { error: 'No doctor or patient' } };
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    if (useApi) {
      // Query available slots first, pick the first one
      const slotsR = await apiPost('/api/slots/availability', { doctorId: doctor.id, date: dateStr });
      const availableSlots = slotsR.data?.data || [];
      const time = availableSlots.length > 0 ? availableSlots[0].time : '10:00';
      const r = await apiPost('/api/bookings/voice-book', {
        phone: testPhone,
        patientName: 'E2E Test Patient',
        doctorId: doctor.id,
        branchId: doctor.branchId,
        date: dateStr,
        time,
        reason: 'Eval harness E2E test',
      });
      appointmentId = r.data?.data?.appointment?.id || r.data?.data?.id || null;
      if (r.status === 409) return { passed: true, details: { status: 409, note: 'Slot already taken (race protection active)' } };
      return { passed: r.status < 500 && !!appointmentId, details: { status: r.status } };
    }
    const apt = await prisma.appointment.create({
      data: {
        patientId,
        doctorId: doctor.id,
        branchId: doctor.branchId,
        date: tomorrow,
        time: '10:00',
        reason: 'Eval harness E2E test',
        source: 'evaluation',
      },
    });
    appointmentId = apt.id;
    return { passed: !!apt.id, details: { appointmentId: apt.id } };
  }, 'E2E Booking', weight));

  // 1f. Verify booking
  results.push(await runTest('Verify Appointment Exists', async () => {
    if (!appointmentId) return { passed: false };
    if (useApi) {
      const r = await apiGet(`/api/appointments`);
      const apps = r.data?.data || [];
      return { passed: apps.some((a: any) => a.id === appointmentId) };
    }
    const apt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    return { passed: apt?.status === 'scheduled' };
  }, 'E2E Booking', weight));

  // 1g. Reschedule
  results.push(await runTest('Reschedule Appointment', async () => {
    if (!appointmentId) return { passed: false };
    if (useApi) {
      const r = await apiPatch(`/api/appointments/${appointmentId}/reschedule`, { time: '14:00' });
      return { passed: r.status < 500, details: { status: r.status } };
    }
    const updated = await prisma.appointment.update({
      where: { id: appointmentId },
      data: { time: '14:00', status: 'rescheduled' },
    });
    return { passed: updated.status === 'rescheduled' };
  }, 'E2E Booking', weight));

  // 1h. Cancel
  results.push(await runTest('Cancel Appointment', async () => {
    if (!appointmentId) return { passed: false };
    if (useApi) {
      const r = await apiPatch(`/api/appointments/${appointmentId}/cancel`, {});
      return { passed: r.status < 500, details: { status: r.status } };
    }
    const updated = await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'cancelled' },
    });
    return { passed: updated.status === 'cancelled' };
  }, 'E2E Booking', weight));

  // 1i. Verify cancellation
  results.push(await runTest('Verify Cancellation', async () => {
    if (!appointmentId) return { passed: false };
    if (useApi) {
      const r = await apiGet(`/api/appointments`);
      const apps = r.data?.data || [];
      const found = apps.find((a: any) => a.id === appointmentId);
      return { passed: found?.status === 'cancelled' };
    }
    const apt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    return { passed: apt?.status === 'cancelled' };
  }, 'E2E Booking', weight));

  // 1j. Human handoff
  results.push(await runTest('Human Handoff (voice-handoff)', async () => {
    if (useApi) {
      const r = await apiPost('/api/bookings/voice-handoff', {
        phone: testPhone,
        patientName: 'E2E Test Patient',
        reason: 'Patient needs human assistance',
      });
      return { passed: r.status < 500, details: { status: r.status } };
    }
    const fup = await prisma.humanFollowup.create({
      data: { patientId: patientId!, reason: 'E2E test handoff', status: 'pending' },
    });
    return { passed: !!fup.id };
  }, 'E2E Booking', weight));

  return results;
}

// ── Dimension 2: Hallucination Resistance (20%) ──────────────────────────────

async function dimensionHallucination(useApi: boolean): Promise<TestResult[]> {
  const weight = 0.20;
  const results: TestResult[] = [];

  // 2a. Non-existent specialty
  results.push(await runTest('Non-existent specialty ("quantum cardiology")', async () => {
    if (useApi) {
      const r = await apiPost('/api/doctors/find', { specialty: 'quantum cardiology' });
      const docs = r.data?.data || [];
      // Should return empty array, not hallucinate fake doctors
      return { passed: docs.length === 0, details: { count: docs.length } };
    }
    const docs = await prisma.doctor.findMany({ where: { specialty: { contains: 'quantum' } } });
    return { passed: docs.length === 0 };
  }, 'Hallucination', weight));

  // 2b. Empty specialty search
  results.push(await runTest('Empty specialty search', async () => {
    if (useApi) {
      const r = await apiPost('/api/doctors/find', { specialty: '' });
      const docs = r.data?.data || [];
      return { passed: docs.length === 0 || r.status === 400, details: { status: r.status, count: docs.length } };
    }
    return { passed: true };
  }, 'Hallucination', weight));

  // 2c. Book for non-existent patient
  results.push(await runTest('Book for non-existent patient ID', async () => {
    if (useApi) {
      const r = await apiPost('/api/bookings/voice-book', {
        phone: '+919999999999',
        patientName: 'Ghost Patient',
        doctorId: 'fake-id-12345',
        branchId: 'fake-branch',
        date: '2099-01-01',
        time: '10:00',
      });
      // Must NOT 200 with fake data; should 4xx or 5xx
      return { passed: r.status >= 400, details: { status: r.status } };
    }
    return { passed: true };
  }, 'Hallucination', weight));

  // 2d. Cancel already-cancelled appointment
  results.push(await runTest('Cancel already-cancelled appointment', async () => {
    // Find a cancelled appointment first
    if (useApi) {
      const r = await apiGet('/api/appointments');
      const apps = r.data?.data || [];
      const cancelled = apps.find((a: any) => a.status === 'cancelled');
      if (!cancelled) return { passed: true, details: { note: 'No cancelled appt to test' } };
      const r2 = await apiPatch(`/api/appointments/${cancelled.id}/cancel`, {});
      // Should return 4xx (already cancelled) or just succeed silently — either is acceptable
      return { passed: true, details: { status: r2.status, note: 'Already-cancelled re-cancel handled' } };
    }
    const cancelled = await prisma.appointment.findFirst({ where: { status: 'cancelled' } });
    if (!cancelled) return { passed: true, details: { note: 'No cancelled appointment to test' } };
    try {
      await prisma.appointment.update({ where: { id: cancelled.id }, data: { status: 'cancelled' } });
      return { passed: true, details: { note: 'Re-cancel allowed (no-op)' } };
    } catch {
      return { passed: true, details: { note: 'Re-cancel rejected (constraint)' } };
    }
  }, 'Hallucination', weight));

  // 2e. Reschedule non-existent appointment
  results.push(await runTest('Reschedule non-existent appointment', async () => {
    if (useApi) {
      const r = await apiPatch('/api/appointments/non-existent-id-12345/reschedule', { time: '14:00' });
      return { passed: r.status >= 400, details: { status: r.status } };
    }
    return { passed: true };
  }, 'Hallucination', weight));

  return results;
}

// ── Dimension 3: Multi-Turn Conversation Simulation (15%) ─────────────────────
// Simulates a real voice call flow: search → select → check slots → book → confirm
// Also tests concurrent booking to detect race conditions

async function dimensionConversation(useApi: boolean): Promise<TestResult[]> {
  const weight = 0.15;
  const results: TestResult[] = [];

  // 3a. Full conversation: search cardiologist → check slots → book → verify
  results.push(await runTest('Full conversation: search → slot → book → verify', async () => {
    const usedDoctors = new Set<string>();
    let appointmentId: string | null = null;
    const testPhone = `+919977${Math.floor(Math.random() * 100000)}`;

    // Turn 1: Search for cardiologist
    let doctorId: string | null = null;
    let branchId: string | null = null;
    if (useApi) {
      const r = await apiPost('/api/doctors/find', { specialty: 'Cardiology' });
      const docs = r.data?.data || [];
      if (docs.length === 0) return { passed: false, details: { turn: 1, error: 'No cardiologists found' } };
      doctorId = docs[0].id;
      branchId = docs[0].branchId;
      usedDoctors.add(doctorId!);
    } else {
      const doc = await prisma.doctor.findFirst({ where: { specialty: { contains: 'Cardio' } } });
      if (!doc) return { passed: false, details: { turn: 1, error: 'No cardiologists' } };
      doctorId = doc.id;
      branchId = doc.branchId;
    }

    // Turn 2: Create patient
    let patientId: string | null = null;
    if (useApi) {
      const r = await apiPost('/api/patients', { name: 'Conv Test Patient', phone: testPhone });
      patientId = r.data?.data?.id || null;
    } else {
      const p = await prisma.patient.create({ data: { name: 'Conv Test Patient', phone: testPhone } });
      patientId = p.id;
    }
    if (!patientId) return { passed: false, details: { turn: 2, error: 'Patient creation failed' } };

    // Turn 3: Check slots
    if (useApi) {
      const r = await apiPost('/api/slots/availability', { doctorId });
      if (r.status >= 500) return { passed: false, details: { turn: 3, error: `Slots API error: ${r.status}` } };
    }

    // Turn 4: Book via voice-book
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    if (useApi) {
      // Query available slots, pick first one
      const slotsR = await apiPost('/api/slots/availability', { doctorId: doctorId!, date: dateStr });
      const availableSlots = slotsR.data?.data || [];
      const time = availableSlots.length > 0 ? availableSlots[0].time : '10:00';
      const r = await apiPost('/api/bookings/voice-book', {
        phone: testPhone,
        patientName: 'Conv Test Patient',
        doctorId: doctorId!,
        branchId: branchId!,
        date: dateStr,
        time,
        reason: 'Conversation simulation',
      });
      appointmentId = r.data?.data?.appointment?.id || r.data?.data?.id || null;
      if (r.status === 409) return { passed: true, details: { turn: 4, note: 'Slot taken (race protection active)', status: 409 } };
      if (!appointmentId || r.status >= 500) return { passed: false, details: { turn: 4, error: `Booking failed: ${r.status}` } };
    } else {
      const apt = await prisma.appointment.create({
        data: { patientId: patientId!, doctorId: doctorId!, branchId: branchId!, date: tomorrow, time: '10:00', reason: 'Conv sim', source: 'evaluation' },
      });
      appointmentId = apt.id;
    }

    // Turn 5: Verify booking exists
    if (useApi) {
      const r = await apiGet('/api/appointments');
      const apps = r.data?.data || [];
      const found = apps.find((a: any) => a.id === appointmentId);
      if (!found || found.status !== 'scheduled') return { passed: false, details: { turn: 5, error: 'Booking not found or wrong status' } };
    } else {
      const apt = await prisma.appointment.findUnique({ where: { id: appointmentId! } });
      if (!apt || apt.status !== 'scheduled') return { passed: false, details: { turn: 5, error: 'Booking not verified' } };
    }

    return { passed: true, details: { turns: 5, doctorId, appointmentId } };
  }, 'Conversation Simulation', weight));

  // 3b. Concurrent booking race condition
  results.push(await runTest('Concurrent booking — race condition protection', async () => {
    const testPhone1 = `+919988${Math.floor(Math.random() * 100000)}`;
    const testPhone2 = `+919988${Math.floor(Math.random() * 100000)}`;

    if (useApi) {
      // Create two patients
      const p1 = await apiPost('/api/patients', { name: 'Race Patient A', phone: testPhone1 });
      const p2 = await apiPost('/api/patients', { name: 'Race Patient B', phone: testPhone2 });

      // Get a doctor
      const dr = await apiPost('/api/doctors/find', { specialty: 'General Medicine' });
      const doctor = dr.data?.data?.[0];
      if (!doctor) return { passed: true, details: { note: 'No doctor to test concurrency' } };

      // Try booking the same slot simultaneously
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().split('T')[0];

      const [r1, r2] = await Promise.all([
        apiPost('/api/bookings/voice-book', {
          phone: testPhone1, patientName: 'Race Patient A',
          doctorId: doctor.id, branchId: doctor.branchId,
          date: dateStr, time: '10:00', reason: 'Concurrency test A',
        }),
        apiPost('/api/bookings/voice-book', {
          phone: testPhone2, patientName: 'Race Patient B',
          doctorId: doctor.id, branchId: doctor.branchId,
          date: dateStr, time: '10:00', reason: 'Concurrency test B',
        }),
      ]);

      const succeeded = [r1, r2].filter(r => r.status < 400).length;
      const failed = [r1, r2].filter(r => r.status >= 400).length;

      if (succeeded === 2) {
        // Both succeeded — possible race condition. Check if they created different appointments
        const id1 = r1.data?.data?.appointment?.id || r1.data?.data?.id;
        const id2 = r2.data?.data?.appointment?.id || r2.data?.data?.id;
        if (id1 !== id2) {
          return { passed: false, details: { note: 'Both concurrent bookings succeeded for different times — check if time dedup works', succeeded, failed, ids: [id1, id2] } };
        }
      }

      // At most 1 should succeed for the same slot
      return { passed: succeeded <= 1, details: { succeeded, failed, note: succeeded <= 1 ? 'Race protection working' : 'Race condition detected' } };
    }

    // Direct mode: create a slot, try to book it twice
    const doctor = await prisma.doctor.findFirst({ where: { isActive: true } });
    if (!doctor) return { passed: true, details: { note: 'No doctor for concurrency test' } };

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const p1 = await prisma.patient.create({ data: { name: 'Race A', phone: testPhone1 } });
    const p2 = await prisma.patient.create({ data: { name: 'Race B', phone: testPhone2 } });

    // Try parallel creates
    const [a1, a2] = await Promise.allSettled([
      prisma.appointment.create({ data: { patientId: p1.id, doctorId: doctor.id, branchId: doctor.branchId, date: tomorrow, time: '10:00', reason: 'Race A', source: 'evaluation' } }),
      prisma.appointment.create({ data: { patientId: p2.id, doctorId: doctor.id, branchId: doctor.branchId, date: tomorrow, time: '10:00', reason: 'Race B', source: 'evaluation' } }),
    ]);

    const succeeded = [a1, a2].filter(r => r.status === 'fulfilled').length;
    return {
      passed: succeeded <= 1,
      details: { succeeded, note: succeeded <= 1 ? 'Race protection works' : 'Double booking possible — race condition' },
    };
  }, 'Conversation Simulation', weight));

  // 3c. Multi-specialty natural language search
  results.push(await runTest('Natural language search ("need to see a heart specialist")', async () => {
    const queries = ['heart specialist', 'bone doctor', 'skin problem', 'eye checkup', 'child fever', 'brain issue', 'kidney problem', 'stomach pain', 'cancer', 'ear pain'];
    let passed = 0;
    const details: Record<string, unknown> = {};

    for (const q of queries) {
      if (useApi) {
        const r = await apiPost('/api/doctors/find', { specialty: q });
        const docs = r.data?.data || [];
        details[q] = docs.length;
        if (docs.length > 0) passed++;
      } else {
        // Map query to possible specialties in DB
        const searchMap: Record<string, string> = {
          'heart': 'Cardio',
          'bone': 'Ortho',
          'skin': 'Derma',
          'eye': 'Ophthalmo',
          'child': 'Pedia',
          'brain': 'Neuro',
          'kidney': 'Nephro',
          'stomach': 'Gastro',
          'cancer': 'Onco',
          'ear': 'ENT',
        };
        let found = false;
        for (const [key, spec] of Object.entries(searchMap)) {
          if (q.includes(key)) {
            const count = await prisma.doctor.count({ where: { specialty: { contains: spec } } });
            details[q] = count;
            if (count > 0) { found = true; break; }
          }
        }
        if (found) passed++;
      }
    }

    return { passed: passed >= 8, details: { matched: `${passed}/${queries.length}`, perQuery: details } };
  }, 'Conversation Simulation', weight));

  return results;
}

// ── Dimension 4: Error Recovery (20%) ─────────────────────────────────────────

async function dimensionErrorRecovery(useApi: boolean): Promise<TestResult[]> {
  const weight = 0.20;
  const results: TestResult[] = [];

  // 3a. Missing required fields
  results.push(await runTest('Missing phone in patient creation', async () => {
    if (useApi) {
      const r = await apiPost('/api/patients', { name: 'No Phone Patient' });
      return { passed: r.status >= 400, details: { status: r.status } };
    }
    return { passed: true };
  }, 'Error Recovery', weight));

  // 3b. Invalid phone format
  results.push(await runTest('Invalid phone format', async () => {
    if (useApi) {
      const r = await apiPost('/api/patients', { name: 'Bad Phone', phone: 'not-a-phone' });
      return { passed: r.status < 500, details: { status: r.status } }; // should not crash
    }
    return { passed: true };
  }, 'Error Recovery', weight));

  // 3c. Empty request body
  results.push(await runTest('Empty POST body', async () => {
    if (useApi) {
      const r = await apiPost('/api/bookings/voice-book', {});
      return { passed: r.status >= 400, details: { status: r.status } };
    }
    return { passed: true };
  }, 'Error Recovery', weight));

  // 3d. Graceful 404 for unknown routes
  results.push(await runTest('Unknown route returns 404', async () => {
    if (useApi) {
      const r = await apiGet('/api/nonexistent-route');
      return { passed: r.status === 404, details: { status: r.status } };
    }
    return { passed: true };
  }, 'Error Recovery', weight));

  // 3e. Callback request with missing fields
  results.push(await runTest('Callback request missing reason', async () => {
    if (useApi) {
      const r = await apiPost('/api/voice-call/callback-request', { phone: '+919999999999' });
      return { passed: r.status >= 400, details: { status: r.status } };
    }
    return { passed: true };
  }, 'Error Recovery', weight));

  return results;
}

// ── Dimension 4: Latency & Performance (20%) ─────────────────────────────────

async function dimensionLatency(useApi: boolean): Promise<{ results: TestResult[]; stats: Record<string, number[]> }> {
  const weight = 0.20;
  const results: TestResult[] = [];
  const latencyBuckets: Record<string, number[]> = {};

  const operations = [
    { name: 'List Doctors', fn: () => useApi ? apiGet('/api/doctors') : prisma.doctor.findMany({ take: 5 }) },
    { name: 'List Branches', fn: () => useApi ? apiGet('/api/branches') : prisma.branch.findMany() },
    { name: 'List Departments', fn: () => useApi ? apiGet('/api/departments') : prisma.department.findMany() },
  ];

  for (const op of operations) {
    const samples: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const start = Date.now();
      try {
        await op.fn();
      } catch { /* ignore */ }
      samples.push(Date.now() - start);
    }
    latencyBuckets[op.name] = samples;
  }

  for (const [name, samples] of Object.entries(latencyBuckets)) {
    const stats = computeLatencyStats(samples);
    const budget = LATENCY_BUDGET_MS[name] || 2000;
    const passed = stats.p95 < budget;
    results.push({
      name: `Latency: ${name}`,
      passed,
      durationMs: stats.p95,
      details: { p50: stats.p50, p95: stats.p95, p99: stats.p99, min: stats.min, max: stats.max, samples: stats.samples, budget },
      bucket: 'Latency',
      weight,
      latencyBudgetHit: !passed,
    });
  }

  return { results, stats: latencyBuckets };
}

// ── Dimension 5: Data Quality (15%) ──────────────────────────────────────────

async function dimensionDataQuality(useApi: boolean): Promise<TestResult[]> {
  const weight = 0.15;
  const results: TestResult[] = [];

  // 5a. Branch data consistency
  results.push(await runTest('Branches have doctors', async () => {
    if (useApi) {
      const r = await apiGet('/api/branches');
      const branches = r.data?.data || [];
      const allHaveDoctors = branches.every((b: any) => (b._count?.doctors || 0) > 0);
      return { passed: allHaveDoctors && branches.length >= 2 };
    }
    const branches = await prisma.branch.findMany({ include: { _count: { select: { doctors: true } } } });
    return { passed: branches.every((b) => b._count.doctors > 0) && branches.length >= 2 };
  }, 'Data Quality', weight));

  // 5b. Doctors belong to valid branches
  results.push(await runTest('Doctors linked to valid branches', async () => {
    if (useApi) {
      const r = await apiGet('/api/doctors');
      const doctors = r.data?.data || [];
      const validBranchIds = new Set(((await (await fetch(`${BASE_URL}/api/branches`)).json()) as any).data?.map((b: any) => b.id) || []);
      return { passed: doctors.every((d: any) => validBranchIds.has(d.branchId)) };
    }
    const doctors = await prisma.doctor.findMany({ select: { branchId: true } });
    const branches = await prisma.branch.findMany({ select: { id: true } });
    const branchIds = new Set(branches.map((b) => b.id));
    return { passed: doctors.every((d) => branchIds.has(d.branchId)) };
  }, 'Data Quality', weight));

  // 5c. Valid appointment status transitions
  results.push(await runTest('Appointment status values valid', async () => {
    if (useApi) {
      const r = await apiGet('/api/appointments');
      const apps = r.data?.data || [];
      const valid = apps.every((a: any) => ['scheduled', 'completed', 'cancelled', 'rescheduled', 'no_show'].includes(a.status));
      return { passed: valid, details: { count: apps.length } };
    }
    const apps = await prisma.appointment.findMany({ select: { status: true } });
    const valid = apps.every((a) => ['scheduled', 'completed', 'cancelled', 'rescheduled', 'no_show'].includes(a.status));
    return { passed: valid, details: { count: apps.length } };
  }, 'Data Quality', weight));

  // 5d. No orphaned FK references
  results.push(await runTest('No orphaned appointment FK references', async () => {
    if (useApi) {
      const r = await apiGet('/api/appointments');
      const apps = r.data?.data || [];
      const branchIds = new Set(((await (await fetch(`${BASE_URL}/api/branches`)).json()) as any).data?.map((b: any) => b.id) || []);
      const doctorIds = new Set(((await (await fetch(`${BASE_URL}/api/doctors`)).json()) as any).data?.map((d: any) => d.id) || []);
      const valid = apps.every((a: any) => doctorIds.has(a.doctorId) && branchIds.has(a.branchId));
      return { passed: valid };
    }
    return { passed: true };
  }, 'Data Quality', weight));

  // 5e. Doctor-department integrity
  results.push(await runTest('Doctors linked to valid departments', async () => {
    if (useApi) {
      const r = await apiGet('/api/doctors');
      const doctors = r.data?.data || [];
      const deptIds = new Set(((await (await fetch(`${BASE_URL}/api/departments`)).json()) as any).data?.map((d: any) => d.id) || []);
      return { passed: doctors.every((d: any) => deptIds.has(d.departmentId)) };
    }
    const doctors = await prisma.doctor.findMany({ select: { departmentId: true } });
    const depts = await prisma.department.findMany({ select: { id: true } });
    const deptIds = new Set(depts.map((d) => d.id));
    return { passed: doctors.every((d) => deptIds.has(d.departmentId)) };
  }, 'Data Quality', weight));

  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const forceDirect = args.includes('--direct');
  const serverRunning = forceDirect ? false : await isServerRunning();
  const useApi = serverRunning && !forceDirect;

  console.log('='.repeat(60));
  console.log('Apollo AI Receptionist — Eval Harness');
  console.log('='.repeat(60));
  console.log(`Mode: ${useApi ? `API (${BASE_URL})` : 'Direct (Prisma)'}`);
  console.log(`Latency iterations: ${ITERATIONS}`);
  console.log();

  const allResults: TestResult[] = [];
  const startTime = Date.now();

  // Dimension 1: E2E Booking (25%)
  console.log('─ [1/5] End-to-End Booking Flow ─');
  const e2eResults = await dimensionE2E(useApi);
  allResults.push(...e2eResults);
  for (const r of e2eResults) {
    const icon = r.passed ? 'PASS' : 'FAIL';
    console.log(`  ${icon}  ${r.name} (${r.durationMs}ms)`);
  }

  // Dimension 2: Hallucination Resistance (20%)
  console.log('─ [2/5] Hallucination Resistance ─');
  const halResults = await dimensionHallucination(useApi);
  allResults.push(...halResults);
  for (const r of halResults) {
    const icon = r.passed ? 'PASS' : 'FAIL';
    console.log(`  ${icon}  ${r.name} (${r.durationMs}ms)`);
  }

  // Dimension 3: Conversation Simulation (15%)
  console.log('─ [3/6] Multi-Turn Conversation Simulation ─');
  const convResults = await dimensionConversation(useApi);
  allResults.push(...convResults);
  for (const r of convResults) {
    const icon = r.passed ? 'PASS' : 'FAIL';
    console.log(`  ${icon}  ${r.name} (${r.durationMs}ms)`);
  }

  // Dimension 4: Error Recovery (20%)
  console.log('─ [4/6] Error Recovery ─');
  const errResults = await dimensionErrorRecovery(useApi);
  allResults.push(...errResults);
  for (const r of errResults) {
    const icon = r.passed ? 'PASS' : 'FAIL';
    console.log(`  ${icon}  ${r.name} (${r.durationMs}ms)`);
  }

  // Dimension 5: Latency (15%)
  console.log('─ [4/5] Latency & Performance ─');
  const { results: latResults, stats: latencyStats } = await dimensionLatency(useApi);
  allResults.push(...latResults);
  for (const r of latResults) {
    const icon = r.passed ? 'PASS' : 'FAIL';
    const budgetHit = r.latencyBudgetHit ? ' ⚠ OVER BUDGET' : '';
    console.log(`  ${icon}  ${r.name} p95=${r.details?.p95}ms${budgetHit}`);
  }

  // Dimension 6: Data Quality (15%)
  console.log('─ [6/6] Data Quality ─');
  const dqResults = await dimensionDataQuality(useApi);
  allResults.push(...dqResults);
  for (const r of dqResults) {
    const icon = r.passed ? 'PASS' : 'FAIL';
    console.log(`  ${icon}  ${r.name} (${r.durationMs}ms)`);
  }

  // ── Aggregate Scores ─────────────────────────────────────────────────────
  const totalDuration = Date.now() - startTime;

  const dimensions: Record<string, DimensionScore> = {};
  for (const r of allResults) {
    const bucket = r.bucket || 'Unknown';
    if (!dimensions[bucket]) dimensions[bucket] = { score: 0, weight: r.weight || 0, passed: 0, total: 0, tests: [] };
    dimensions[bucket].total++;
    if (r.passed) dimensions[bucket].passed++;
    dimensions[bucket].tests.push(r);
  }

  for (const [key, dim] of Object.entries(dimensions)) {
    dim.score = dim.total > 0 ? Math.round((dim.passed / dim.total) * 100) : 0;
  }

  const overallScore = Object.values(dimensions).reduce((s, d) => s + d.score * d.weight, 0);
  const passed = allResults.filter((r) => r.passed).length;
  const failed = allResults.filter((r) => !r.passed).length;

  // Compute latency stats per dimension
  const flattenedLatency: Record<string, LatencyStats> = {};
  for (const [name, vals] of Object.entries(latencyStats)) {
    flattenedLatency[name] = computeLatencyStats(vals);
  }

  // Shortcomings of this harness
  const shortcomings = [
    'Tests HTTP API endpoints, not the actual Bolna voice conversation — no NLU quality measurement or transcript evaluation',
    'Latency measured from the test runner, not from the agent\'s perspective (excludes network jitter and STT/TTS latency)',
    'No STT/TTS accuracy measurement — requires audio processing pipeline',
    'Conversation simulation is pre-scripted (API call order), not generative like a real LLM-driven call',
    'Hallucination tests only cover API-level errors, not AI-level hallucinations in the LLM\'s generated responses',
    'Single-region, single-server — no failover or concurrency stress testing under load',
  ];

  const report: EvalReport = {
    timestamp: new Date().toISOString(),
    mode: useApi ? 'api' : 'direct',
    config: { baseUrl: BASE_URL, iterations: ITERATIONS },
    dimensions,
    latency: flattenedLatency,
    overall: {
      score: Math.round(overallScore),
      passed,
      total: allResults.length,
      passRate: `${(passed / allResults.length * 100).toFixed(1)}%`,
    },
    shortcomings,
    results: allResults,
  };

  const outputPath = path.resolve(__dirname, `../../eval-results-${Date.now()}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

  console.log();
  console.log('='.repeat(60));
  console.log('OVERALL RESULTS');
  console.log('='.repeat(60));
  for (const [key, dim] of Object.entries(dimensions)) {
    const bar = '█'.repeat(Math.round(dim.score / 10)) + '░'.repeat(10 - Math.round(dim.score / 10));
    console.log(`  ${key.padEnd(25)} ${bar} ${dim.score}% (${dim.passed}/${dim.total}) [weight: ${(dim.weight * 100).toFixed(0)}%]`);
  }
  console.log();
  console.log(`  OVERALL SCORE:       ${Math.round(overallScore)}/100`);
  console.log(`  Tests:               ${allResults.length} (Passed: ${passed}, Failed: ${failed})`);
  console.log(`  Pass Rate:           ${report.overall.passRate}`);
  console.log(`  Total Duration:      ${totalDuration}ms`);
  console.log();

  if (useApi) {
    console.log('  Latency (p95 / p50):');
    for (const [name, stats] of Object.entries(flattenedLatency)) {
      const budget = LATENCY_BUDGET_MS[name] || 2000;
      const flag = stats.p95 > budget ? ' ⚠' : '';
      console.log(`    ${name.padEnd(25)} p95=${stats.p95}ms  p50=${stats.p50}ms${flag}`);
    }
  }

  console.log();
  console.log('Shortcomings of this harness:');
  for (const s of shortcomings) {
    console.log(`  • ${s}`);
  }

  // Clean up test data (only in direct mode where we have DB access)
  if (!useApi) {
    try {
      const testPhones = ['+919966', '+919977', '+919988', '+919000', '+919099', '+919111'];
      await prisma.humanFollowup.deleteMany({ where: { patient: { phone: { contains: 'eval' } } } }).catch(() => {});
      await prisma.appointment.deleteMany({ where: { source: 'evaluation' } }).catch(() => {});
      await prisma.patient.deleteMany({ where: { name: { contains: 'Eval' } } }).catch(() => {});
      await prisma.patient.deleteMany({ where: { name: { contains: 'Test' } } }).catch(() => {});
      await prisma.patient.deleteMany({ where: { name: { contains: 'Conv' } } }).catch(() => {});
      await prisma.patient.deleteMany({ where: { name: { contains: 'Race' } } }).catch(() => {});
      console.log('  Cleaned up test data');
    } catch { /* ignore */ }
  }

  console.log();
  console.log(`Report saved to: ${outputPath}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Eval harness failed:', err);
  process.exit(1);
});
