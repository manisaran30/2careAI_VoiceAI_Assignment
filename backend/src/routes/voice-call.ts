import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { getProvider } from '../voice/provider-registry';
import { CallParams } from '../voice/provider';
import { broadcastToSession } from './sse';
import { withRetry } from '../middleware/retry';
import { logger } from '../logger';
import crypto from 'crypto';

const router = Router();

function generateSessionId(): string {
  return `sess_${crypto.randomUUID().slice(0, 8)}_${Date.now().toString(36)}`;
}

function broadcastCallEvent(sessionId: string, eventType: string, payload: unknown): void {
  broadcastToSession(sessionId, eventType, payload);
}

// POST /api/voice-call/initiate — Create a call session
router.post('/initiate', async (req: Request, res: Response) => {
  try {
    const { phone, fromPhone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    let formattedPhone = phone.trim();
    if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+91' + formattedPhone;
    }

    const sessionId = generateSessionId();
    logger.info('VoiceCall.initiate', `Creating session ${sessionId} for ${formattedPhone}`);

    // Find or create patient
    let patient = await prisma.patient.findUnique({ where: { phone: formattedPhone } });
    if (!patient) {
      patient = await prisma.patient.create({
        data: { name: `Guest (${formattedPhone})`, phone: formattedPhone },
      });
    }

    // Create call log with connecting status
    const callLog = await withRetry(() =>
      prisma.callLog.create({
        data: {
          callId: sessionId,
          sessionId,
          phone: formattedPhone,
          direction: 'outbound',
          status: 'connecting',
          patientId: patient!.id,
        },
      }),
      'VoiceCall.initiate'
    );

    broadcastCallEvent(sessionId, 'call.connecting', { sessionId, phone: formattedPhone });

    // Attempt to initiate via voice provider
    try {
      const provider = getProvider();
      const callParams: CallParams = { recipientPhone: formattedPhone };
      if (fromPhone) callParams.fromPhone = fromPhone;
      callParams.userData = { sessionId, patientId: patient.id };

      const result = await provider.initiateCall(callParams);

      await withRetry(() =>
        prisma.callLog.update({
          where: { id: callLog.id },
          data: { callId: result.executionId, status: 'active' },
        }),
        'VoiceCall.initiate'
      );

      broadcastCallEvent(sessionId, 'call.active', {
        sessionId,
        executionId: result.executionId,
        status: result.status,
      });

      logger.info('VoiceCall.initiate', `Call active for session ${sessionId}`, {
        executionId: result.executionId,
      });

      res.status(201).json({
        success: true,
        data: {
          sessionId,
          callLogId: callLog.id,
          executionId: result.executionId,
          status: 'active',
        },
      });
    } catch (providerErr) {
      // Provider failed — mark as failed but return session for error recovery
      await withRetry(() =>
        prisma.callLog.update({
          where: { id: callLog.id },
          data: { status: 'failed', errorLog: JSON.stringify([{ error: String(providerErr) }]) },
        }),
        'VoiceCall.initiate.error'
      );

      broadcastCallEvent(sessionId, 'call.error', {
        sessionId,
        message: 'Unable to connect the call. Please try again.',
      });

      logger.error('VoiceCall.initiate', `Provider error for session ${sessionId}`, {
        error: String(providerErr),
      });

      res.status(200).json({
        success: true,
        data: {
          sessionId,
          callLogId: callLog.id,
          status: 'failed',
          error: 'Unable to connect the call. Please try again.',
        },
      });
    }
  } catch (error) {
    logger.error('VoiceCall.initiate', 'Failed to initiate call', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /api/voice-call/:sessionId/end — End an active call
router.post('/:sessionId/end', async (req: Request, res: Response) => {
  const { sessionId } = req.params;

  try {
    logger.info('VoiceCall.end', `Ending session ${sessionId}`);

    const callLog = await withRetry(() =>
      prisma.callLog.findFirst({ where: { sessionId } }),
      'VoiceCall.end'
    );

    if (!callLog) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Try to end via provider if active
    if (callLog.status === 'active' && callLog.callId !== callLog.sessionId) {
      try {
        const provider = getProvider();
        await provider.endCall(callLog.callId);
      } catch (providerErr) {
        logger.warn('VoiceCall.end', 'Provider endCall failed (call may already be done)', {
          error: String(providerErr),
        });
      }
    }

    await withRetry(() =>
      prisma.callLog.update({
        where: { id: callLog.id },
        data: { status: 'completed' },
      }),
      'VoiceCall.end'
    );

    broadcastCallEvent(sessionId, 'call.completed', { sessionId });

    res.json({ success: true, data: { sessionId, status: 'completed' } });
  } catch (error) {
    logger.error('VoiceCall.end', `Failed to end session ${sessionId}`, { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// GET /api/voice-call/:sessionId — Get session details
router.get('/:sessionId', async (req: Request, res: Response) => {
  const { sessionId } = req.params;

  try {
    const callLog = await prisma.callLog.findFirst({
      where: { sessionId },
      include: {
        conversationSummary: true,
        patient: { select: { name: true, phone: true } },
        appointments: {
          include: {
            doctor: { select: { name: true, specialty: true } },
            branch: { select: { name: true } },
          },
        },
        callEvents: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!callLog) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ success: true, data: callLog });
  } catch (error) {
    logger.error('VoiceCall.get', `Failed to get session ${sessionId}`, { error: String(error) });
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// POST /api/voice-call/callback-request — Queue a human callback (no call needed)
router.post('/callback-request', async (req: Request, res: Response) => {
  try {
    const { phone, name, reason } = req.body;

    if (!phone || !reason) {
      return res.status(400).json({ error: 'Phone and reason are required' });
    }

    let formattedPhone = phone.trim();
    if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+91' + formattedPhone;
    }

    let patient = await prisma.patient.findUnique({ where: { phone: formattedPhone } });
    if (!patient) {
      patient = await prisma.patient.create({
        data: { name: name || `Guest (${formattedPhone})`, phone: formattedPhone },
      });
    }

    const followup = await prisma.humanFollowup.create({
      data: {
        patientId: patient.id,
        reason,
        status: 'pending',
      },
      include: {
        patient: { select: { name: true, phone: true } },
      },
    });

    logger.info('VoiceCall.callback', 'Callback requested', {
      phone: formattedPhone,
      reason,
      followupId: followup.id,
    });

    res.status(201).json({ success: true, data: followup });
  } catch (error) {
    logger.error('VoiceCall.callback', 'Failed to create callback request', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// GET /api/voice-call — List all sessions
router.get('/', async (_req: Request, res: Response) => {
  try {
    const sessions = await prisma.callLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        patient: { select: { name: true, phone: true } },
        conversationSummary: true,
        _count: { select: { appointments: true } },
      },
    });

    res.json({ success: true, data: sessions });
  } catch (error) {
    logger.error('VoiceCall.list', 'Failed to list sessions', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

export default router;
