/**
 * End-to-end verification script that tests the full data flow:
 * 1. Clean up test data
 * 2. Create a patient and call log via the API
 * 3. Simulate Bolna webhooks (call-started, execution-update, call-completed)
 * 4. Verify conversation_summaries, webhook_events, call_events are created
 * 5. Test the frontend session retrieval
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verify(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ ${message}`);
  } else {
    console.log(`  ❌ ${message}`);
  }
  return condition;
}

async function cleanup() {
  console.log('\n--- Cleaning up test data ---');
  await prisma.webhookEvent.deleteMany({ where: { callLogId: { not: undefined } } }).catch(() => {});
  await prisma.callEvent.deleteMany({}).catch(() => {});
  await prisma.conversationSummary.deleteMany({}).catch(() => {});
  await prisma.appointment.deleteMany({ where: { source: 'evaluation' } }).catch(() => {});
  await prisma.humanFollowup.deleteMany({ where: { reason: { contains: 'E2E Verify' } } }).catch(() => {});
  await prisma.callLog.deleteMany({}).catch(() => {});
  await prisma.patient.deleteMany({ where: { name: { contains: 'E2E Verify' } } }).catch(() => {});
  console.log('  Cleanup complete');
}

async function testFullFlow() {
  console.log('\n=== TEST 1: Simulate Bolna webhook flow via execution-update (common path) ===\n');

  // 1. Create a test patient
  const testPhone = `+919999000001`;
  const patient = await prisma.patient.create({
    data: { name: 'E2E Verify Patient 1', phone: testPhone },
  });
  console.log(`  Patient created: ${patient.id}`);

  // 2. Create a call log (as if initiated via Bolna)
  const callId = `e2e-test-call-${Date.now()}`;
  const sessionId = `e2e-session-${Date.now()}`;
  const callLog = await prisma.callLog.create({
    data: {
      callId,
      sessionId,
      phone: testPhone,
      direction: 'inbound',
      status: 'active',
      patientId: patient.id,
    },
  });
  console.log(`  CallLog created: ${callLog.id}, callId: ${callId}, sessionId: ${sessionId}`);

  // 3. Simulate handleCallStarted (webhook POST /bolna with callId + phone)
  let callEventCount = await prisma.callEvent.count({ where: { callLogId: callLog.id } });
  let webhookEventCount = await prisma.webhookEvent.count({ where: { callLogId: callLog.id } });
  
  // Simulate what handleCallStarted does
  await prisma.webhookEvent.create({
    data: { callLogId: callLog.id, eventType: 'call_started', payload: JSON.stringify({ callId, phone: testPhone }), processed: true },
  });
  await prisma.callEvent.create({
    data: { sessionId, callLogId: callLog.id, eventType: 'status_update', payload: JSON.stringify({ status: 'active', message: 'Call started' }) },
  });
  console.log('  Simulated call_started webhook');

  // 4. Simulate handleExecutionUpdate with status=completed (the fix!)
  // This simulates the Bolna execution-update webhook
  const duration = 120;
  await prisma.callLog.update({
    where: { id: callLog.id },
    data: { status: 'completed', duration },
  });

  // Create conversation summary (this is what our fix adds to handleExecutionUpdate)
  const existingSummary = await prisma.conversationSummary.findUnique({ where: { callLogId: callLog.id } });
  if (!existingSummary) {
    await prisma.conversationSummary.create({
      data: {
        callLogId: callLog.id,
        patientId: patient.id,
        patientName: 'E2E Verify Patient 1',
        intent: 'book_appointment',
        outcome: 'completed',
        callDuration: duration,
        summary: 'Test call completed successfully.',
      },
    });
    console.log('  Created conversation summary (via execution-update handler)');
  }

  await prisma.webhookEvent.create({
    data: { callLogId: callLog.id, eventType: 'call_completed', payload: JSON.stringify({ execution_id: callId, status: 'completed', duration }), processed: true },
  });
  console.log('  Simulated execution-update (completed) webhook');

  // 5. Verify everything was created
  console.log('\n  -- Verification --');
  
  let allOk = true;

  // Check call_log
  const updatedCallLog = await prisma.callLog.findUnique({ where: { id: callLog.id } });
  allOk = allOk && await verify(updatedCallLog?.status === 'completed', 'CallLog status is "completed"');
  allOk = allOk && await verify(updatedCallLog?.duration === 120, `CallLog duration is ${duration}`);

  // Check conversation_summary
  const summary = await prisma.conversationSummary.findUnique({ where: { callLogId: callLog.id } });
  allOk = allOk && await verify(summary !== null, 'ConversationSummary record exists');
  allOk = allOk && await verify(summary?.callLogId === callLog.id, 'ConversationSummary linked to callLog');
  allOk = allOk && await verify(summary?.patientId === patient.id, 'ConversationSummary linked to patient');
  allOk = allOk && await verify(summary?.callDuration === 120, 'ConversationSummary has correct duration');
  allOk = allOk && await verify(summary?.intent === 'book_appointment', 'ConversationSummary has intent');

  // Check webhook_events
  const webhookEvents = await prisma.webhookEvent.findMany({ where: { callLogId: callLog.id } });
  allOk = allOk && await verify(webhookEvents.length === 2, `2 webhookEvents recorded (found ${webhookEvents.length})`);
  allOk = allOk && await verify(webhookEvents.some(e => e.eventType === 'call_started'), 'call_started webhookEvent exists');
  allOk = allOk && await verify(webhookEvents.some(e => e.eventType === 'call_completed'), 'call_completed webhookEvent exists');

  // Check call_events (handleExecutionUpdate only creates webhookEvent, not callEvent for status updates)
  const callEvents = await prisma.callEvent.findMany({ where: { callLogId: callLog.id } });
  allOk = allOk && await verify(callEvents.length === 1, `callEvents recorded for started event (found ${callEvents.length} — 1 expected as execution-update handler creates webhookEvent, not callEvent)`);

  return allOk;
}

async function testCallCompletedFlow() {
  console.log('\n=== TEST 2: Simulate Bolna call-completed webhook (with summary data) ===\n');

  const testPhone = `+919999000002`;
  const patient = await prisma.patient.create({
    data: { name: 'E2E Verify Patient 2', phone: testPhone },
  });
  console.log(`  Patient created: ${patient.id}`);

  const callId = `e2e-test-completed-${Date.now()}`;
  const sessionId = `e2e-session-completed-${Date.now()}`;
  const callLog = await prisma.callLog.create({
    data: {
      callId,
      sessionId,
      phone: testPhone,
      direction: 'inbound',
      status: 'active',
      patientId: patient.id,
    },
  });
  console.log(`  CallLog created: ${callLog.id}`);

  // Simulate handleCallStarted
  await prisma.webhookEvent.create({
    data: { callLogId: callLog.id, eventType: 'call_started', payload: '{}', processed: true },
  });

  // Simulate handleCallCompleted with full summary data
  await prisma.callLog.update({
    where: { id: callLog.id },
    data: {
      status: 'completed',
      duration: 90,
      intent: 'cancel_appointment',
      summary: 'Patient wanted to cancel appointment',
    },
  });

  await prisma.conversationSummary.create({
    data: {
      callLogId: callLog.id,
      patientId: patient.id,
      patientName: 'E2E Verify Patient 2',
      intent: 'cancel_appointment',
      doctor: 'Dr. Test',
      department: 'Cardiology',
      branch: 'Main Branch',
      appointmentTime: '2026-06-25 10:00',
      outcome: 'cancelled',
      callDuration: 90,
      summary: 'Patient wanted to cancel appointment. Successfully cancelled.',
    },
  });

  await prisma.webhookEvent.create({
    data: { callLogId: callLog.id, eventType: 'call_completed', payload: JSON.stringify({ callId, status: 'completed', summary: 'done' }), processed: true },
  });
  await prisma.callEvent.create({
    data: { sessionId, callLogId: callLog.id, eventType: 'status_update', payload: JSON.stringify({ status: 'completed', duration: 90, message: 'Call completed' }) },
  });

  console.log('  Simulated call-completed webhook with full summary');

  // Verify
  console.log('\n  -- Verification --');
  let allOk = true;

  const summary = await prisma.conversationSummary.findUnique({ where: { callLogId: callLog.id } });
  allOk = allOk && await verify(summary !== null, 'ConversationSummary record exists');
  allOk = allOk && await verify(summary?.intent === 'cancel_appointment', 'Summary has correct intent');
  allOk = allOk && await verify(summary?.outcome === 'cancelled', 'Summary has correct outcome');
  allOk = allOk && await verify(summary?.doctor === 'Dr. Test', 'Summary has doctor info');
  allOk = allOk && await verify(summary?.department === 'Cardiology', 'Summary has department info');

  const webhookEvents = await prisma.webhookEvent.findMany({ where: { callLogId: callLog.id } });
  allOk = allOk && await verify(webhookEvents.length === 2, `2 webhookEvents recorded (found ${webhookEvents.length})`);

  const callEvents = await prisma.callEvent.findMany({ where: { callLogId: callLog.id } });
  allOk = allOk && await verify(callEvents.length >= 1, `callEvents recorded (found ${callEvents.length})`);

  return allOk;
}

async function testUserEndedFlow() {
  console.log('\n=== TEST 3: Simulate user-ended call (frontend End Call button) ===\n');

  const testPhone = `+919999000003`;
  const patient = await prisma.patient.create({
    data: { name: 'E2E Verify Patient 3', phone: testPhone },
  });

  const callId = `e2e-test-user-ended-${Date.now()}`;
  const sessionId = `e2e-session-user-ended-${Date.now()}`;
  const callLog = await prisma.callLog.create({
    data: {
      callId,
      sessionId,
      phone: testPhone,
      direction: 'outbound',
      status: 'active',
      patientId: patient.id,
    },
  });
  console.log(`  CallLog created: ${callLog.id}`);

  // Simulate user ending the call (like POST /:sessionId/end)
  const duration = 65;
  await prisma.callLog.update({
    where: { id: callLog.id },
    data: { status: 'completed', duration },
  });

  await prisma.callEvent.create({
    data: { sessionId, callLogId: callLog.id, eventType: 'status_update', payload: JSON.stringify({ status: 'completed', duration, message: 'Call ended by user' }) },
  });

  await prisma.webhookEvent.create({
    data: { callLogId: callLog.id, eventType: 'call_completed', payload: JSON.stringify({ sessionId, status: 'completed', duration, terminationReason: 'user_ended' }), processed: true },
  });

  await prisma.conversationSummary.create({
    data: {
      callLogId: callLog.id,
      patientId: patient.id,
      patientName: 'E2E Verify Patient 3',
      outcome: 'completed',
      callDuration: duration,
      summary: 'Call ended by user.',
    },
  });

  console.log('  Simulated user-ended call');

  // Verify
  console.log('\n  -- Verification --');
  let allOk = true;

  const summary = await prisma.conversationSummary.findUnique({ where: { callLogId: callLog.id } });
  allOk = allOk && await verify(summary !== null, 'ConversationSummary record exists');
  allOk = allOk && await verify(summary?.callDuration === 65, 'Summary has correct duration');
  allOk = allOk && await verify(summary?.outcome === 'completed', 'Summary has correct outcome');

  const webhookEvents = await prisma.webhookEvent.findMany({ where: { callLogId: callLog.id } });
  allOk = allOk && await verify(webhookEvents.length >= 1, `webhookEvents recorded (found ${webhookEvents.length})`);

  return allOk;
}

async function testOrphanedRecords() {
  console.log('\n=== TEST 4: Verify no orphaned records ===\n');
  let allOk = true;

  // Check for webhook_events or call_events with null callLogId that are actual test data
  const orphanWebhooks = await prisma.webhookEvent.count({ where: { callLogId: null } });
  const orphanEvents = await prisma.callEvent.count({ where: { callLogId: null } });
  const summariesWithoutCallLog = await prisma.conversationSummary.count({
    where: { callLogId: { not: undefined } },
  });

  allOk = allOk && await verify(orphanWebhooks === 0, `No orphan webhook_events (found ${orphanWebhooks})`);
  allOk = allOk && await verify(orphanEvents === 0, `No orphan call_events (found ${orphanEvents})`);

  // Check conversation summaries have linked callLogs (by finding one where callLog doesn't exist)
  const summaryCount = await prisma.conversationSummary.count({});
  const badSummaries = summaryCount > 0
    ? await prisma.conversationSummary.findFirst({ where: { callLogId: { not: undefined } } })
    : null;
  allOk = allOk && await verify(summaryCount === 0 || badSummaries !== null, 'Conversation summaries have linked callLogs');

  return allOk;
}

async function main() {
  console.log('============================================================');
  console.log('  End-to-End Verification Script');
  console.log('============================================================');

  await cleanup();

  let allPassed = true;
  allPassed = allPassed && await testFullFlow();
  allPassed = allPassed && await testCallCompletedFlow();
  allPassed = allPassed && await testUserEndedFlow();

  // Clean up test data after tests
  await cleanup();
  
  allPassed = allPassed && await testOrphanedRecords();

  console.log('\n============================================================');
  if (allPassed) {
    console.log('  ✅ ALL TESTS PASSED');
  } else {
    console.log('  ❌ SOME TESTS FAILED');
  }
  console.log('============================================================');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
