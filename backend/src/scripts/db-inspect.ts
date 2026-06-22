import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
async function main() {
  const callLogs = await p.callLog.findMany({ include: { webhookEvents: true, callEvents: true } });
  console.log('=== CALL LOGS ===');
  callLogs.forEach(cl => {
    console.log(`ID: ${cl.id}, callId: ${cl.callId}, sessionId: ${cl.sessionId}, status: ${cl.status}, patientId: ${cl.patientId}`);
    console.log(`  webhookEvents: ${cl.webhookEvents.length}`);
    console.log(`  callEvents: ${cl.callEvents.length}`);
  });

  const webhooks = await p.webhookEvent.findMany();
  console.log('\n=== WEBHOOK EVENTS ===');
  webhooks.forEach(w => console.log(`ID: ${w.id}, callLogId: ${w.callLogId}, eventType: ${w.eventType}, processed: ${w.processed}`));

  const callEvts = await p.callEvent.findMany();
  console.log('\n=== CALL EVENTS ===');
  callEvts.forEach(e => console.log(`ID: ${e.id}, sessionId: ${e.sessionId}, callLogId: ${e.callLogId}, eventType: ${e.eventType}`));

  const summaries = await p.conversationSummary.findMany();
  console.log('\n=== CONVERSATION SUMMARIES ===');
  summaries.forEach(s => console.log(`ID: ${s.id}, callLogId: ${s.callLogId}, intent: ${s.intent}, outcome: ${s.outcome}`));

  await p.$disconnect();
}
main().catch(console.error);
