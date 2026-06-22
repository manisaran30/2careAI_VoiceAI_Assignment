import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { broadcast, broadcastToSession } from './sse';
import { sessionManager } from '../voice/session-manager';
import { withRetry } from '../middleware/retry';
import { logger } from '../logger';

const router = Router();

function safeJsonParse(str: string | null | undefined): unknown {
  if (!str) return null;
  try {
    return JSON.parse(str as string);
  } catch {
    return str;
  }
}

function resolveSessionId(callId: string, bodySessionId?: string): string | null {
  if (bodySessionId) {
    const existing = sessionManager.getSession(bodySessionId);
    if (existing) return bodySessionId;
  }

  // Try to find by callLog
  const allSessions = sessionManager.getAllActiveSessions();
  for (const s of allSessions) {
    if (s.executionId === callId) return s.sessionId;
  }

  return bodySessionId || null;
}

// POST /api/webhooks/bolna — Unified webhook endpoint for all Bolna events
// Bolna sends ALL execution data to this URL. We route based on payload fields.
router.post('/bolna', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const loggerCtx = 'Webhooks.unified';

    // Normalize various Bolna payload formats
    if (!body.callId && !body.execution_id && body.id) {
      body.callId = body.id;
      logger.info(loggerCtx, 'Normalized: mapped body.id → callId', { callId: body.id });
    }
    if (body.duration === undefined && body.conversation_duration !== undefined) {
      body.duration = body.conversation_duration;
    }
    if (!body.sessionId && body.context_details?.recipient_data?.sessionId) {
      body.sessionId = body.context_details.recipient_data.sessionId;
    }

    // Detect event type by checking payload fields
    if (body.text) {
      logger.info(loggerCtx, 'Routing to transcript handler');
      return await handleTranscript(req, res);
    }

    if (body.operation) {
      logger.info(loggerCtx, 'Routing to operation handler');
      return await handleOperation(req, res);
    }

    if (body.execution_id) {
      logger.info(loggerCtx, 'Routing to execution-update handler');
      return await handleExecutionUpdate(req, res);
    }

    if (body.type === 'call_completed' || body.event === 'call.completed') {
      logger.info(loggerCtx, 'Routing to call-completed handler (type/event match)');
      return await handleCallCompleted(req, res);
    }

    if (body.callId && body.phone) {
      logger.info(loggerCtx, 'Routing to call-started handler');
      return await handleCallStarted(req, res);
    }

    if (body.callId && (body.status === 'completed' || body.summary || body.duration !== undefined)) {
      logger.info(loggerCtx, 'Routing to call-completed handler');
      return await handleCallCompleted(req, res);
    }

    if (body.callId && body.action) {
      logger.info(loggerCtx, 'Routing to booking handler');
      return await handleBooking(req, res);
    }

    // Unknown payload — log and return ok so Bolna doesn't retry
    logger.warn(loggerCtx, 'Unknown webhook payload', { payload: body });
    res.json({ success: true });
  } catch (error) {
    logger.error('Webhooks.unified', 'Error processing webhook', { error: String(error) });
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

async function handleCallStarted(req: Request, res: Response) {
  const { callId, phone, direction, sessionId: bodySessionId } = req.body;

  if (!callId || !phone) {
    return res.status(400).json({ error: 'callId and phone are required' });
  }

  const logSessionId = bodySessionId || resolveSessionId(callId) || `bolna_${callId}`;

  let patient = await prisma.patient.findUnique({ where: { phone } });
  if (!patient) {
    patient = await prisma.patient.create({
      data: { name: `Guest (${phone})`, phone },
    });
  }

  let callLog = await prisma.callLog.findUnique({ where: { callId } }).catch(() => null);

  if (!callLog) {
    // Maybe the initiate flow created a callLog with a different callId (sessionId as callId)
    // Try finding by sessionId from the session manager
    const existingSession = sessionManager.getSession(logSessionId);
    if (existingSession?.callLogId) {
      callLog = await prisma.callLog.findUnique({ where: { id: existingSession.callLogId } }).catch(() => null);
    }
  }

  if (callLog) {
    callLog = await prisma.callLog.update({
      where: { id: callLog.id },
      data: { status: 'active', sessionId: logSessionId, callId },
    });
  } else {
    callLog = await prisma.callLog.create({
      data: {
        callId,
        sessionId: logSessionId,
        phone,
        direction: direction || 'inbound',
        status: 'active',
        patientId: patient.id,
      },
    });
  }

  let session = sessionManager.getSession(logSessionId);
  if (session) {
    sessionManager.transition(logSessionId, 'connected', {
      executionId: callId,
      callLogId: callLog.id,
      patientId: patient.id,
    });
  } else {
    session = sessionManager.createSession(logSessionId, phone);
    sessionManager.transition(logSessionId, 'connected', {
      executionId: callId,
      callLogId: callLog.id,
      patientId: patient.id,
    });
  }

  await Promise.all([
    prisma.webhookEvent.create({
      data: { callLogId: callLog.id, eventType: 'call_started', payload: JSON.stringify(req.body), processed: true },
    }),
    prisma.callEvent.create({
      data: { sessionId: logSessionId, callLogId: callLog.id, eventType: 'status_update', payload: JSON.stringify({ status: 'active', message: 'Call started' }) },
    }),
  ]);

  broadcast('dashboard', 'call.started', { sessionId: logSessionId, status: 'active' });

  return res.status(201).json({ success: true, data: { callLogId: callLog.id } });
}

async function handleCallCompleted(req: Request, res: Response) {
  const { callId, duration, intent, summary, patientName, doctor, department, branch, appointmentTime, outcome, sessionId: bodySessionId } = req.body;

  if (!callId) {
    return res.status(400).json({ error: 'callId is required' });
  }

  const extracted = req.body.extracted_data;
  const subjectiveSummary = extracted?.General?.['Call Summary']?.subjective || null;
  const callSummary = subjectiveSummary || summary || null;

  let callLog = await prisma.callLog.findUnique({ where: { callId } });
  if (!callLog && bodySessionId) {
    callLog = await prisma.callLog.findFirst({ where: { sessionId: bodySessionId } });
  }
  if (!callLog) {
    callLog = await prisma.callLog.create({
      data: {
        callId, sessionId: bodySessionId || callId, phone: req.body.phone || 'unknown',
        direction: 'inbound', status: 'completed', duration: duration || null,
        intent: intent || null, summary: callSummary,
      },
    });
  }

  const logSessionId = bodySessionId || callLog.sessionId || callId;

  await withRetry(() =>
    prisma.callLog.update({
      where: { callId },
      data: { status: 'completed', duration: duration || null, intent: intent || null, summary: callSummary },
    }), 'Webhooks.call-completed'
  ).catch(() => {});

  let appointmentDoctor: string | null = null;
  let appointmentBranch: string | null = null;
  let appointmentTimeStr: string | null = null;
  try {
    const appt = await prisma.appointment.findFirst({
      where: { callLogId: callLog.id },
      include: { doctor: { select: { name: true } }, branch: { select: { name: true } } },
    });
    if (appt) {
      appointmentDoctor = appt.doctor.name;
      appointmentBranch = appt.branch.name;
      appointmentTimeStr = appt.time ? `${appt.date.toISOString().split('T')[0]} ${appt.time}` : null;
    }
  } catch { /* ignore */ }

  const resolvedIntent = intent || callLog.intent || callLog.operation || null;
  const resolvedOutcome = outcome || 'completed';

  const summaryData = {
    callLogId: callLog.id, patientId: callLog.patientId || undefined, patientName: patientName || null,
    intent: resolvedIntent, doctor: doctor || appointmentDoctor || null, department: department || null,
    branch: branch || appointmentBranch || null, appointmentTime: appointmentTime || appointmentTimeStr || null,
    outcome: resolvedOutcome, callDuration: duration || null, summary: callSummary,
  };

  try {
    const existingSummary = await prisma.conversationSummary.findUnique({ where: { callLogId: callLog.id } });
    if (existingSummary) {
      await prisma.conversationSummary.update({ where: { callLogId: callLog.id }, data: summaryData });
    } else {
      await prisma.conversationSummary.create({ data: summaryData as any });
    }
  } catch (err) {
    logger.error('Webhooks.call-completed', 'Failed to save conversation summary', { error: String(err), callLogId: callLog.id });
  }

  await Promise.all([
    prisma.webhookEvent.create({ data: { callLogId: callLog.id, eventType: 'call_completed', payload: JSON.stringify(req.body), processed: true } }),
    prisma.callEvent.create({ data: { sessionId: logSessionId, callLogId: callLog.id, eventType: 'status_update', payload: JSON.stringify({ status: 'completed', duration, message: 'Call completed' }) } }),
  ]).catch(() => {});

  const session = sessionManager.getSession(logSessionId);
  if (session && !['completed', 'disconnected', 'idle'].includes(session.state)) {
    const currentState = session.state;
    if (currentState !== 'ending') {
      sessionManager.transition(logSessionId, 'ending', { terminationReason: 'agent_ended' });
    }
    sessionManager.transition(logSessionId, 'completed', {
      endTime: Date.now(), terminationReason: 'agent_ended',
      summary: { patientName: patientName || null, intent: intent || null, doctor: doctor || null, department: department || null, branch: branch || null, appointmentTime: appointmentTime || null, outcome: outcome || null, callDuration: duration || null, summary: callSummary },
    });
  } else {
    broadcastToSession(logSessionId, 'call.completed', { sessionId: logSessionId, state: 'completed', terminationReason: 'agent_ended', summary: summaryData });
  }

  broadcast('dashboard', 'call.completed', { sessionId: logSessionId, outcome: resolvedOutcome });
  return res.json({ success: true });
}

async function handleExecutionUpdate(req: Request, res: Response) {
  const { execution_id, status, call_id, duration, summary, intent, patientName, doctor, department, branch, appointmentTime, outcome, sessionId: bodySessionId } = req.body;
  if (!execution_id) {
    return res.status(400).json({ error: 'execution_id is required' });
  }

  const callId = call_id || execution_id;
  let callLog = await prisma.callLog.findUnique({ where: { callId } }).catch(() => null);
  if (!callLog && bodySessionId) {
    callLog = await prisma.callLog.findFirst({ where: { sessionId: bodySessionId } }).catch(() => null);
  }
  const logSessionId = bodySessionId || callLog?.sessionId || callId;

  const session = sessionManager.getSession(logSessionId);
  if (session) {
    switch (status) {
      case 'in-progress':
        if (session.state === 'connecting') sessionManager.transition(logSessionId, 'connected', { executionId: callId });
        break;
      case 'completed':
        if (!['completed', 'disconnected', 'idle'].includes(session.state)) {
          sessionManager.transition(logSessionId, 'ending', { terminationReason: 'agent_ended' });
          sessionManager.transition(logSessionId, 'completed', { endTime: Date.now(), terminationReason: 'agent_ended' });
        }
        break;
      case 'failed':
        if (!['completed', 'disconnected'].includes(session.state)) {
          sessionManager.transition(logSessionId, 'disconnected', { terminationReason: 'provider_failure', errorLog: [`Execution failed: ${status}`] });
        }
        break;
      case 'queued':
        if (session.state === 'idle') sessionManager.transition(logSessionId, 'connecting');
        break;
    }
  }

  if (callLog) {
    const mappedStatus = status === 'in-progress' ? 'active' : status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : status === 'queued' ? 'connecting' : status;
    await prisma.callLog.update({
      where: { id: callLog.id },
      data: { status: mappedStatus, ...(status === 'completed' && duration ? { duration } : {}) },
    });

    // When execution completes, create or update conversation summary
    if (status === 'completed') {
      let appointmentDoctor: string | null = null;
      let appointmentBranch: string | null = null;
      let appointmentTimeStr: string | null = null;
      try {
        const appt = await prisma.appointment.findFirst({
          where: { callLogId: callLog.id },
          include: { doctor: { select: { name: true } }, branch: { select: { name: true } } },
        });
        if (appt) {
          appointmentDoctor = appt.doctor.name;
          appointmentBranch = appt.branch.name;
          appointmentTimeStr = appt.time ? `${appt.date.toISOString().split('T')[0]} ${appt.time}` : null;
        }
      } catch { /* ignore */ }

      const resolvedOutcome = outcome || 'completed';
      const summaryData = {
        callLogId: callLog.id,
        patientId: callLog.patientId || undefined,
        patientName: patientName || null,
        intent: intent || callLog.intent || null,
        doctor: doctor || appointmentDoctor || null,
        department: department || null,
        branch: branch || appointmentBranch || null,
        appointmentTime: appointmentTime || appointmentTimeStr || null,
        outcome: resolvedOutcome,
        callDuration: duration || null,
        summary: summary || null,
      };

      const existingSummary = await prisma.conversationSummary.findUnique({ where: { callLogId: callLog.id } }).catch(() => null);
      if (existingSummary) {
        await prisma.conversationSummary.update({ where: { callLogId: callLog.id }, data: summaryData }).catch(() => {});
      } else {
        await prisma.conversationSummary.create({ data: summaryData as any }).catch(() => {});
      }
    }
  }

  if (!callLog?.id) {
    logger.warn('Webhooks.execution-update', 'No callLog found for webhook event', { execution_id, callId });
  }
  await prisma.webhookEvent.create({
    data: { callLogId: callLog?.id || undefined, eventType: status === 'completed' ? 'call_completed' : 'execution_update', payload: JSON.stringify(req.body), processed: true },
  });

  // Broadcast completion to frontend if applicable
  if (status === 'completed' && callLog?.sessionId) {
    const summaryData = callLog ? {
      callLogId: callLog.id,
      patientId: callLog.patientId || undefined,
      intent: intent || null,
      outcome: outcome || 'completed',
      callDuration: duration || null,
    } : undefined;
    broadcastToSession(logSessionId, 'call.completed', {
      sessionId: logSessionId,
      state: 'completed',
      terminationReason: 'agent_ended',
      summary: summaryData,
    });
    broadcast('dashboard', 'call.completed', { sessionId: logSessionId, outcome: outcome || 'completed' });
  }

  return res.json({ success: true });
}

async function handleTranscript(req: Request, res: Response) {
  const { callId, sessionId: bodySessionId, text, speaker } = req.body;
  if (!callId || !text) {
    return res.status(400).json({ error: 'callId and text are required' });
  }

  const callLog = await prisma.callLog.findUnique({ where: { callId } }).catch(() => null);
  const logSessionId = bodySessionId || callLog?.sessionId || callId;

  try {
    const entry = { speaker: speaker || 'unknown', text, timestamp: new Date().toISOString() };
    sessionManager.appendTranscript(logSessionId, entry);

    if (speaker === 'ai') {
      const s = sessionManager.getSession(logSessionId);
      if (s && s.state !== 'ai_speaking' && ['connected', 'user_speaking', 'processing'].includes(s.state)) {
        sessionManager.transition(logSessionId, 'ai_speaking');
      }
    } else if (speaker === 'user') {
      const s = sessionManager.getSession(logSessionId);
      if (s && s.state !== 'user_speaking' && ['connected', 'ai_speaking', 'processing'].includes(s.state)) {
        sessionManager.transition(logSessionId, 'user_speaking');
      }
    }
  } catch {
    broadcastToSession(logSessionId, 'call.transcript', { sessionId: logSessionId, speaker, text });
  }

  if (callLog) {
    const existingTranscript = safeJsonParse(callLog.transcript) as Array<unknown> || [];
    const transcriptEntry = { speaker: speaker || 'unknown', text, timestamp: new Date().toISOString() };
    if (Array.isArray(existingTranscript)) existingTranscript.push(transcriptEntry);
    await prisma.callLog.update({ where: { id: callLog.id }, data: { transcript: JSON.stringify(existingTranscript) } }).catch(() => {});
  }

  await prisma.callEvent.create({
    data: { sessionId: logSessionId, callLogId: callLog?.id || undefined, eventType: 'transcript', payload: JSON.stringify({ speaker, text }) },
  });

  return res.json({ success: true });
}

async function handleOperation(req: Request, res: Response) {
  const { callId, sessionId: bodySessionId, operation } = req.body;
  if (!callId || !operation) {
    return res.status(400).json({ error: 'callId and operation are required' });
  }

  const callLog = await prisma.callLog.findUnique({ where: { callId } }).catch(() => null);
  const logSessionId = bodySessionId || callLog?.sessionId || callId;

  try {
    sessionManager.setOperation(logSessionId, operation);
    const s = sessionManager.getSession(logSessionId);
    if (s && !['processing', 'ending', 'disconnected'].includes(s.state)) {
      sessionManager.transition(logSessionId, 'processing');
    }
  } catch {
    broadcastToSession(logSessionId, 'call.operation', { sessionId: logSessionId, operation });
  }

  if (callLog) {
    await prisma.callLog.update({ where: { id: callLog.id }, data: { operation } }).catch(() => {});
  }

  await prisma.callEvent.create({
    data: { sessionId: logSessionId, callLogId: callLog?.id || undefined, eventType: 'operation', payload: JSON.stringify({ operation }) },
  });

  return res.json({ success: true });
}

async function handleBooking(req: Request, res: Response) {
  const { callId, action, appointmentId, sessionId: bodySessionId } = req.body;
  if (!callId) {
    return res.status(400).json({ error: 'callId is required' });
  }

  const callLog = await prisma.callLog.findUnique({ where: { callId } });
  if (!callLog) {
    return res.status(404).json({ error: 'Call log not found' });
  }

  const logSessionId = bodySessionId || callLog.sessionId || callId;

  await prisma.webhookEvent.create({
    data: { callLogId: callLog.id, eventType: 'booking', payload: JSON.stringify(req.body), processed: true },
  });

  if (appointmentId) {
    await prisma.appointment.update({ where: { id: appointmentId }, data: { callLogId: callLog.id } });

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { doctor: { select: { name: true } }, branch: { select: { name: true } } },
    });

    if (appointment) {
      sessionManager.addAppointment(logSessionId, {
        id: appointment.id, doctor: appointment.doctor || undefined, branch: appointment.branch || undefined,
        date: appointment.date?.toISOString(), time: appointment.time || undefined, status: appointment.status,
      });
    }

    broadcast('dashboard', 'call.booking', { action, appointment });
  }

  sessionManager.setOperation(logSessionId, action === 'created' ? 'Booking confirmed' : 'Booking updated');
  return res.json({ success: true });
}

// POST /api/webhooks/bolna/call-started — Bolna call started event
router.post('/bolna/call-started', async (req: Request, res: Response) => {
  try {
    return await handleCallStarted(req, res);
  } catch (error) {
    logger.error('Webhooks.call-started', 'Error processing', { error: String(error) });
    if (!res.headersSent) res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// POST /api/webhooks/bolna/call-completed — Bolna call completed with summary
router.post('/bolna/call-completed', async (req: Request, res: Response) => {
  try {
    return await handleCallCompleted(req, res);
  } catch (error) {
    logger.error('Webhooks.call-completed', 'Error processing', { error: String(error) });
    if (!res.headersSent) res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// POST /api/webhooks/bolna/booking — Booking event
router.post('/bolna/booking', async (req: Request, res: Response) => {
  try {
    return await handleBooking(req, res);
  } catch (error) {
    logger.error('Webhooks.booking', 'Error processing', { error: String(error) });
    if (!res.headersSent) res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// POST /api/webhooks/bolna/execution-update — Execution status update
router.post('/bolna/execution-update', async (req: Request, res: Response) => {
  try {
    return await handleExecutionUpdate(req, res);
  } catch (error) {
    logger.error('Webhooks.execution-update', 'Error processing', { error: String(error) });
    if (!res.headersSent) res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// POST /api/webhooks/bolna/transcript — Streaming transcript chunks
router.post('/bolna/transcript', async (req: Request, res: Response) => {
  try {
    return await handleTranscript(req, res);
  } catch (error) {
    logger.error('Webhooks.transcript', 'Error processing', { error: String(error) });
    if (!res.headersSent) res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// POST /api/webhooks/bolna/operation — Current operation status
router.post('/bolna/operation', async (req: Request, res: Response) => {
  try {
    return await handleOperation(req, res);
  } catch (error) {
    logger.error('Webhooks.operation', 'Error processing', { error: String(error) });
    if (!res.headersSent) res.status(500).json({ error: 'Failed to process webhook' });
  }
});

export default router;
