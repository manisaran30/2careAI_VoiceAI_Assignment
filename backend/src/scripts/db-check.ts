import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const [branches, depts, docs, patients, appts, slots, callLogs, callEvents, summaries, followups, webhookEvents, evals] = await Promise.all([
    p.branch.count(), p.department.count(), p.doctor.count(), p.patient.count(),
    p.appointment.count(), p.appointmentSlot.count(), p.callLog.count(), p.callEvent.count(),
    p.conversationSummary.count(), p.humanFollowup.count(), p.webhookEvent.count(), p.evaluationResult.count(),
  ]);
  console.log('branches:', branches);
  console.log('departments:', depts);
  console.log('doctors:', docs);
  console.log('patients:', patients);
  console.log('appointments:', appts);
  console.log('appointment_slots:', slots);
  console.log('call_logs:', callLogs);
  console.log('call_events:', callEvents);
  console.log('conversation_summaries:', summaries);
  console.log('human_followups:', followups);
  console.log('webhook_events:', webhookEvents);
  console.log('evaluation_results:', evals);

  // Check relationships
  const summaryWithNullPatient = await p.conversationSummary.findFirst({ where: { patientId: null } });
  console.log('summaries with null patientId:', summaryWithNullPatient?.id || 'none');

  const eventsWithNullCallLog = await p.callEvent.findFirst({ where: { callLogId: null } });
  console.log('call_events with null callLogId:', eventsWithNullCallLog?.id || 'none');

  const webhookWithNullCallLog = await p.webhookEvent.findFirst({ where: { callLogId: null } });
  console.log('webhook_events with null callLogId:', webhookWithNullCallLog?.id || 'none');

  await p.$disconnect();
}
main().catch(console.error);
