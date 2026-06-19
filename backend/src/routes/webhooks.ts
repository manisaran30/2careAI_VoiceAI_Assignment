import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { broadcast, broadcastToSession } from './sse';
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

// POST /api/webhooks/bolna/call-started — Bolna call started event
router.post('/bolna/call-started', async (req: Request, res: Response) => {
  try {
    const { callId, phone, direction, sessionId } = req.body;

    if (!callId || !phone) {
      return res.status(400).json({ error: 'callId and phone are required' });
    }

    const logSessionId = sessionId || `bolna_${callId}`;

    let patient = await prisma.patient.findUnique({ where: { phone } });
    if (!patient) {
      patient = await prisma.patient.create({
        data: { name: `Guest (${phone})`, phone },
      });
    }

    // Find existing call log or create new one
    let callLog = await prisma.callLog.findUnique({ where: { callId } }).catch(() => null);
    if (!callLog) {
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
    } else {
      callLog = await prisma.callLog.update({
        where: { callId },
        data: { status: 'active', sessionId: logSessionId },
      });
    }

    await prisma.webhookEvent.create({
      data: {
        callLogId: callLog.id,
        eventType: 'call_started',
        payload: JSON.stringify(req.body),
        processed: true,
      },
    });

    broadcastToSession(logSessionId, 'call.active', {
      sessionId: logSessionId,
      executionId: callId,
      phone,
    });
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
      doctor, department, branch, appointmentTime, outcome, sessionId,
    } = req.body;

    if (!callId) {
      return res.status(400).json({ error: 'callId is required' });
    }

    const callLog = await prisma.callLog.findUnique({ where: { callId } });
    if (!callLog) {
      return res.status(404).json({ error: 'Call log not found' });
    }

    const logSessionId = sessionId || callLog.sessionId || callId;

    await withRetry(() =>
      prisma.callLog.update({
        where: { callId },
        data: {
          status: 'completed',
          duration: duration || null,
          intent: intent || null,
          summary: summary || null,
        },
      }),
      'Webhooks.call-completed'
    );

    // Upsert conversation summary
    const summaryData = {
      callLogId: callLog.id,
      patientId: callLog.patientId || undefined,
      patientName: patientName || null,
      intent: intent || null,
      doctor: doctor || null,
      department: department || null,
      branch: branch || null,
      appointmentTime: appointmentTime || null,
      outcome: outcome || null,
      callDuration: duration || null,
      summary: summary || null,
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
      await prisma.conversationSummary.create({ data: summaryData });
    }

    await prisma.webhookEvent.create({
      data: {
        callLogId: callLog.id,
        eventType: 'call_completed',
        payload: JSON.stringify(req.body),
        processed: true,
      },
    });

    broadcastToSession(logSessionId, 'call.completed', {
      sessionId: logSessionId,
      summary: summaryData,
    });
    broadcast('dashboard', 'call.completed', { sessionId: logSessionId, outcome });

    res.json({ success: true });
  } catch (error) {
    logger.error('Webhooks.call-completed', 'Error processing', { error: String(error) });
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// POST /api/webhooks/bolna/booking — Bolna booking result
router.post('/bolna/booking', async (req: Request, res: Response) => {
  try {
    const { callId, action, appointmentId, sessionId } = req.body;

    if (!callId) {
      return res.status(400).json({ error: 'callId is required' });
    }

    const callLog = await prisma.callLog.findUnique({ where: { callId } });
    if (!callLog) {
      return res.status(404).json({ error: 'Call log not found' });
    }

    const logSessionId = sessionId || callLog.sessionId || callId;

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

      broadcastToSession(logSessionId, 'call.booking', {
        sessionId: logSessionId,
        action,
        appointment,
      });
      broadcast('dashboard', 'call.booking', { action, appointment });
    }

    broadcastToSession(logSessionId, 'call.operation', {
      sessionId: logSessionId,
      operation: action === 'created' ? 'Booking confirmed' : 'Booking updated',
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('Webhooks.booking', 'Error processing', { error: String(error) });
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// POST /api/webhooks/bolna/execution-update — Real-time execution status updates
router.post('/bolna/execution-update', async (req: Request, res: Response) => {
  try {
    const { execution_id, status, call_id, sessionId: bodySessionId } = req.body;

    if (!execution_id) {
      return res.status(400).json({ error: 'execution_id is required' });
    }

    const callId = call_id || execution_id;
    const callLog = await prisma.callLog.findUnique({ where: { callId } }).catch(() => null);
    const logSessionId = bodySessionId || callLog?.sessionId || callId;

    // Update call log status
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

    // Broadcast to session
    const eventType = status === 'completed' ? 'call.completed'
      : status === 'in-progress' ? 'call.active'
      : status === 'failed' ? 'call.error'
      : 'call.status';

    broadcastToSession(logSessionId, eventType, {
      sessionId: logSessionId,
      status,
      duration: req.body.duration,
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
      });
    }

    // Store as call event for replay
    await prisma.callEvent.create({
      data: {
        sessionId: logSessionId,
        callLogId: callLog?.id || undefined,
        eventType: 'transcript',
        payload: JSON.stringify({ speaker, text }),
      },
    });

    broadcastToSession(logSessionId, 'call.transcript', {
      sessionId: logSessionId,
      speaker,
      text,
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

    if (callLog) {
      await prisma.callLog.update({
        where: { id: callLog.id },
        data: { operation },
      });
    }

    await prisma.callEvent.create({
      data: {
        sessionId: logSessionId,
        callLogId: callLog?.id || undefined,
        eventType: 'operation',
        payload: JSON.stringify({ operation }),
      },
    });

    broadcastToSession(logSessionId, 'call.operation', {
      sessionId: logSessionId,
      operation,
    });

    res.json({ success: true });
  } catch (error) {
    logger.error('Webhooks.operation', 'Error processing', { error: String(error) });
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

export default router;
