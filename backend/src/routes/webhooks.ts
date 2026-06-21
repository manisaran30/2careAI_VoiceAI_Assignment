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

// POST /api/webhooks/bolna/call-started — Bolna call started event
router.post('/bolna/call-started', async (req: Request, res: Response) => {
  try {
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

    if (callLog) {
      callLog = await prisma.callLog.update({
        where: { callId },
        data: { status: 'active', sessionId: logSessionId },
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

    // Create or update session in manager
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
        data: {
          callLogId: callLog.id,
          eventType: 'call_started',
          payload: JSON.stringify(req.body),
          processed: true,
        },
      }),
      prisma.callEvent.create({
        data: {
          sessionId: logSessionId,
          callLogId: callLog.id,
          eventType: 'status_update',
          payload: JSON.stringify({ status: 'active', message: 'Call started' }),
        },
      }),
    ]);

    broadcast('dashboard', 'call.started', { sessionId: logSessionId, status: 'active' });

    res.status(201).json({ success: true, data: { callLogId: callLog.id } });
  } catch (error) {
    logger.error('Webhooks.call-started', 'Error processing', { error: String(error) });
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// POST /api/webhooks/bolna/call-completed — Bolna call completed with summary
router.post('/bolna/call-completed', async (req: Request, res: Response) => {
  try {
    const {
      callId, duration, intent, summary, patientName,
      doctor, department, branch, appointmentTime, outcome, sessionId: bodySessionId,
    } = req.body;

    if (!callId) {
      return res.status(400).json({ error: 'callId is required' });
    }

    // Parse extracted_data from Bolna if available
    const extracted = req.body.extracted_data;
    const subjectiveSummary = extracted?.General?.['Call Summary']?.subjective || null;

    let callLog = await prisma.callLog.findUnique({ where: { callId } });
    if (!callLog) {
      callLog = await prisma.callLog.create({
        data: {
          callId,
          sessionId: bodySessionId || callId,
          phone: req.body.phone || 'unknown',
          direction: 'inbound',
          status: 'completed',
          duration: duration || null,
          intent: intent || null,
          summary: subjectiveSummary || summary || null,
        },
      });
    }

    const logSessionId = bodySessionId || callLog.sessionId || callId;

    // Update call log
    await withRetry(() =>
      prisma.callLog.update({
        where: { callId },
        data: {
          status: 'completed',
          duration: duration || null,
          intent: intent || null,
          summary: subjectiveSummary || summary || null,
        },
      }),
      'Webhooks.call-completed'
    );

    // Fetch appointment data to populate summary fields when Bolna doesn't send structured data
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

    // Derive intent from callLog operation if not in payload
    const resolvedIntent = intent || callLog.intent || callLog.operation || null;
    const resolvedOutcome = outcome || 'completed';

    // Upsert conversation summary
    const summaryData = {
      callLogId: callLog.id,
      patientId: callLog.patientId || undefined,
      patientName: patientName || null,
      intent: resolvedIntent,
      doctor: doctor || appointmentDoctor || null,
      department: department || null,
      branch: branch || appointmentBranch || null,
      appointmentTime: appointmentTime || appointmentTimeStr || null,
      outcome: resolvedOutcome,
      callDuration: duration || null,
      summary: subjectiveSummary || summary || null,
    };

    const existingSummary = await prisma.conversationSummary.findUnique({
      where: { callLogId: callLog.id },
    });

    if (existingSummary) {
      await prisma.conversationSummary.update({
        where: { callLogId: callLog.id },
        data: summaryData,
      });
    } else {
      await prisma.conversationSummary.create({ data: summaryData as any });
    }

    await Promise.all([
      prisma.webhookEvent.create({
        data: {
          callLogId: callLog.id,
          eventType: 'call_completed',
          payload: JSON.stringify(req.body),
          processed: true,
        },
      }),
      prisma.callEvent.create({
        data: {
          sessionId: logSessionId,
          callLogId: callLog.id,
          eventType: 'status_update',
          payload: JSON.stringify({ status: 'completed', duration, message: 'Call completed' }),
        },
      }),
    ]);

    // Update session manager — transition through ending to completed
    const session = sessionManager.getSession(logSessionId);
    if (session && !['completed', 'disconnected', 'idle'].includes(session.state)) {
      const currentState = session.state;
      if (currentState !== 'ending') {
        sessionManager.transition(logSessionId, 'ending', {
          terminationReason: 'agent_ended',
        });
      }
      sessionManager.transition(logSessionId, 'completed', {
        endTime: Date.now(),
        terminationReason: 'agent_ended',
        summary: {
          patientName: patientName || null,
          intent: intent || null,
          doctor: doctor || null,
          department: department || null,
          branch: branch || null,
          appointmentTime: appointmentTime || null,
          outcome: outcome || null,
          callDuration: duration || null,
          summary: summary || null,
        },
      });
    } else {
      // Session not in memory — broadcast completed directly
      broadcastToSession(logSessionId, 'call.completed', {
        sessionId: logSessionId,
        state: 'completed',
        terminationReason: 'agent_ended',
        summary: summaryData,
      });
    }

    broadcast('dashboard', 'call.completed', { sessionId: logSessionId, outcome });

    res.json({ success: true });
  } catch (error) {
    logger.error('Webhooks.call-completed', 'Error processing', { error: String(error) });
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// POST /api/webhooks/bolna/booking — Booking event
router.post('/bolna/booking', async (req: Request, res: Response) => {
  try {
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
      data: {
        callLogId: callLog.id,
        eventType: 'booking',
        payload: JSON.stringify(req.body),
        processed: true,
      },
    });

    if (appointmentId) {
      await prisma.appointment.update({
        where: { id: appointmentId },
        data: { callLogId: callLog.id },
      });

      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: {
          doctor: { select: { name: true } },
          branch: { select: { name: true } },
        },
      });

      if (appointment) {
        sessionManager.addAppointment(logSessionId, {
          id: appointment.id,
          doctor: appointment.doctor || undefined,
          branch: appointment.branch || undefined,
          date: appointment.date?.toISOString(),
          time: appointment.time || undefined,
          status: appointment.status,
        });
      }

      broadcast('dashboard', 'call.booking', { action, appointment });
    }

    // Update operation
    sessionManager.setOperation(logSessionId, action === 'created' ? 'Booking confirmed' : 'Booking updated');

    res.json({ success: true });
  } catch (error) {
    logger.error('Webhooks.booking', 'Error processing', { error: String(error) });
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// POST /api/webhooks/bolna/execution-update — Execution status update
router.post('/bolna/execution-update', async (req: Request, res: Response) => {
  try {
    const { execution_id, status, call_id, sessionId: bodySessionId } = req.body;

    if (!execution_id) {
      return res.status(400).json({ error: 'execution_id is required' });
    }

    const callId = call_id || execution_id;
    const callLog = await prisma.callLog.findUnique({ where: { callId } }).catch(() => null);
    const logSessionId = bodySessionId || callLog?.sessionId || callId;

    // Update session manager
    const session = sessionManager.getSession(logSessionId);
    if (session) {
      switch (status) {
        case 'in-progress':
          if (session.state === 'connecting') {
            sessionManager.transition(logSessionId, 'connected', { executionId: callId });
          }
          break;
        case 'completed':
          if (!['completed', 'disconnected', 'idle'].includes(session.state)) {
            sessionManager.transition(logSessionId, 'ending', { terminationReason: 'agent_ended' });
            sessionManager.transition(logSessionId, 'completed', {
              endTime: Date.now(),
              terminationReason: 'agent_ended',
            });
          }
          break;
        case 'failed':
          if (!['completed', 'disconnected'].includes(session.state)) {
            sessionManager.transition(logSessionId, 'disconnected', {
              terminationReason: 'provider_failure',
              errorLog: [`Execution failed: ${status}`],
            });
          }
          break;
        case 'queued':
          if (session.state === 'idle') {
            sessionManager.transition(logSessionId, 'connecting');
          }
          break;
      }
    }

    // Update call log
    if (callLog) {
      const mappedStatus = status === 'in-progress' ? 'active'
        : status === 'completed' ? 'completed'
        : status === 'failed' ? 'failed'
        : status === 'queued' ? 'connecting'
        : status;

      await prisma.callLog.update({
        where: { id: callLog.id },
        data: {
          status: mappedStatus,
          ...(status === 'completed' && req.body.duration ? { duration: req.body.duration } : {}),
        },
      });
    }

    // Store event
    await prisma.webhookEvent.create({
      data: {
        callLogId: callLog?.id || undefined,
        eventType: status === 'completed' ? 'call_completed' : 'execution_update',
        payload: JSON.stringify(req.body),
        processed: true,
      },
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('Webhooks.execution-update', 'Error processing', { error: String(error) });
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// POST /api/webhooks/bolna/transcript — Streaming transcript chunks
router.post('/bolna/transcript', async (req: Request, res: Response) => {
  try {
    const { callId, sessionId: bodySessionId, text, speaker } = req.body;

    if (!callId || !text) {
      return res.status(400).json({ error: 'callId and text are required' });
    }

    const callLog = await prisma.callLog.findUnique({ where: { callId } }).catch(() => null);
    const logSessionId = bodySessionId || callLog?.sessionId || callId;

    // Update session manager with transcript and speaker state
    try {
      const entry = {
        speaker: speaker || 'unknown',
        text,
        timestamp: new Date().toISOString(),
      };

      sessionManager.appendTranscript(logSessionId, entry);

      // Update speaker state
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
      // Session may not exist in memory — broadcast directly
      broadcastToSession(logSessionId, 'call.transcript', {
        sessionId: logSessionId,
        speaker,
        text,
      });
    }

    // Accumulate transcript on call log
    if (callLog) {
      const existingTranscript = safeJsonParse(callLog.transcript) as Array<unknown> || [];
      const transcriptEntry = {
        speaker: speaker || 'unknown',
        text,
        timestamp: new Date().toISOString(),
      };

      if (Array.isArray(existingTranscript)) {
        existingTranscript.push(transcriptEntry);
      }

      await prisma.callLog.update({
        where: { id: callLog.id },
        data: { transcript: JSON.stringify(existingTranscript) },
      }).catch(() => {});
    }

    // Store as call event
    await prisma.callEvent.create({
      data: {
        sessionId: logSessionId,
        callLogId: callLog?.id || undefined,
        eventType: 'transcript',
        payload: JSON.stringify({ speaker, text }),
      },
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('Webhooks.transcript', 'Error processing', { error: String(error) });
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// POST /api/webhooks/bolna/operation — Current operation status
router.post('/bolna/operation', async (req: Request, res: Response) => {
  try {
    const { callId, sessionId: bodySessionId, operation } = req.body;

    if (!callId || !operation) {
      return res.status(400).json({ error: 'callId and operation are required' });
    }

    const callLog = await prisma.callLog.findUnique({ where: { callId } }).catch(() => null);
    const logSessionId = bodySessionId || callLog?.sessionId || callId;

    // Update session manager
    try {
      sessionManager.setOperation(logSessionId, operation);
      const s = sessionManager.getSession(logSessionId);
      if (s && !['processing', 'ending', 'disconnected'].includes(s.state)) {
        sessionManager.transition(logSessionId, 'processing');
      }
    } catch {
      broadcastToSession(logSessionId, 'call.operation', {
        sessionId: logSessionId,
        operation,
      });
    }

    // Update DB
    if (callLog) {
      await prisma.callLog.update({
        where: { id: callLog.id },
        data: { operation },
      }).catch(() => {});
    }

    await prisma.callEvent.create({
      data: {
        sessionId: logSessionId,
        callLogId: callLog?.id || undefined,
        eventType: 'operation',
        payload: JSON.stringify({ operation }),
      },
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('Webhooks.operation', 'Error processing', { error: String(error) });
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

export default router;
