import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { getProvider } from '../voice/provider-registry';
import { CallParams } from '../voice/provider';
import { sessionManager, SessionData, ConversationSummaryData } from '../voice/session-manager';
import { broadcast } from './sse';
import { withRetry } from '../middleware/retry';
import { logger } from '../logger';
import crypto from 'crypto';

const router = Router();

function generateSessionId(): string {
  return `sess_${crypto.randomUUID().slice(0, 8)}_${Date.now().toString(36)}`;
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

    const existingActive = sessionManager.hasActiveSession();
    if (existingActive) {
      return res.status(409).json({ error: 'An active session already exists', activeSessionId: existingActive });
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

    // Create session in state machine
    const session = sessionManager.createSession(sessionId, formattedPhone);
    sessionManager.transition(sessionId, 'connecting');

    // Create call log
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

    prisma.callEvent.create({
      data: {
        sessionId,
        callLogId: callLog.id,
        eventType: 'status_update',
        payload: JSON.stringify({ status: 'connecting', message: 'Call initiated' }),
      },
    }).catch(() => {});

    sessionManager.transition(sessionId, 'connecting', {
      callLogId: callLog.id,
      patientId: patient!.id,
    });

    // Attempt to initiate via voice provider
    try {
      const provider = getProvider();
      const callParams: CallParams = { recipientPhone: formattedPhone };
      if (fromPhone) callParams.fromPhone = fromPhone;
      callParams.userData = { sessionId, patientId: patient!.id };

      const result = await provider.initiateCall(callParams);

      await withRetry(() =>
        prisma.callLog.update({
          where: { id: callLog.id },
          data: { callId: result.executionId, status: 'active' },
        }),
        'VoiceCall.initiate'
      );

      prisma.callEvent.create({
        data: {
          sessionId,
          callLogId: callLog.id,
          eventType: 'status_update',
          payload: JSON.stringify({ status: 'active', message: 'Call connected' }),
        },
      }).catch(() => {});

      sessionManager.transition(sessionId, 'connected', {
        executionId: result.executionId,
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
          status: 'connected',
        },
      });
    } catch (providerErr) {
      try {
        await withRetry(() =>
          prisma.callLog.update({
            where: { id: callLog.id },
            data: { status: 'failed', errorLog: JSON.stringify([{ error: String(providerErr) }]) },
          }),
          'VoiceCall.initiate.error'
        ).catch(() => {});
      } catch {
        // ignore
      }

      prisma.callEvent.create({
        data: {
          sessionId,
          callLogId: callLog.id,
          eventType: 'status_update',
          payload: JSON.stringify({ status: 'failed', message: String(providerErr) }),
        },
      }).catch(() => {});

      sessionManager.transition(sessionId, 'disconnected', {
        terminationReason: 'Provider initiation failed',
        errorLog: [String(providerErr)],
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

// POST /api/voice-call/:sessionId/end — End an active call (user-initiated)
router.post('/:sessionId/end', async (req: Request, res: Response) => {
  const { sessionId } = req.params;

  try {
    logger.info('VoiceCall.end', `User ending session ${sessionId}`);

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (['completed', 'disconnected', 'idle'].includes(session.state)) {
      return res.json({ success: true, data: { sessionId, status: session.state } });
    }

    sessionManager.transition(sessionId, 'ending', {
      terminationReason: 'user_ended',
    });

    // End via provider
    if (session.executionId) {
      try {
        const provider = getProvider();
        await provider.endCall(session.executionId);
      } catch (providerErr) {
        logger.warn('VoiceCall.end', 'Provider endCall failed', {
          error: String(providerErr),
        });
      }
    }

    // Update DB — create CallEvent, WebhookEvent, and ConversationSummary alongside
    const callLog = await prisma.callLog.findFirst({ where: { sessionId } });
    const duration = session.startTime ? Math.floor((Date.now() - session.startTime) / 1000) : null;

    if (callLog) {
      await withRetry(() =>
        prisma.callLog.update({
          where: { id: callLog.id },
          data: { status: 'completed', duration },
        }),
        'VoiceCall.end'
      ).catch(() => {});
    }

    // Create status_update CallEvent for lifecycle tracking
    if (callLog) {
      prisma.callEvent.create({
        data: {
          sessionId,
          callLogId: callLog.id,
          eventType: 'status_update',
          payload: JSON.stringify({ status: 'completed', duration, message: 'Call ended by user' }),
        },
      }).catch(() => {});
    }

    // Create WebhookEvent for audit trail
    if (callLog) {
      prisma.webhookEvent.create({
        data: {
          callLogId: callLog.id,
          eventType: 'call_completed',
          payload: JSON.stringify({ sessionId, status: 'completed', duration, terminationReason: 'user_ended' }),
          processed: true,
        },
      }).catch(() => {});
    }

    // Fetch or create ConversationSummary
    let summaryData: ConversationSummaryData | null = null;
    if (callLog) {
      const fullData = await prisma.callLog.findFirst({
        where: { sessionId },
        include: { conversationSummary: true, patient: { select: { name: true } } },
      }).catch(() => null);

      if (fullData?.conversationSummary) {
        const cs = fullData.conversationSummary;
        summaryData = {
          patientName: cs.patientName,
          intent: cs.intent,
          doctor: cs.doctor,
          department: cs.department,
          branch: cs.branch,
          appointmentTime: cs.appointmentTime,
          outcome: cs.outcome,
          callDuration: cs.callDuration,
          summary: cs.summary,
        };
      } else {
        const minimalSummary = {
          callLogId: callLog.id,
          patientId: callLog.patientId || undefined,
          patientName: fullData?.patient?.name || null,
          callDuration: duration,
          outcome: 'completed',
          summary: 'Call ended by user before summary was generated.',
        };
        await prisma.conversationSummary.create({ data: minimalSummary }).catch(() => {});
        summaryData = {
          patientName: minimalSummary.patientName,
          outcome: 'completed',
          callDuration: duration,
          summary: minimalSummary.summary,
        };
      }
    }

    sessionManager.transition(sessionId, 'completed', {
      endTime: Date.now(),
      terminationReason: 'user_ended',
      summary: summaryData,
    });

    // Broadcast to dashboard
    broadcast('dashboard', 'call.completed', {
      sessionId,
      outcome: summaryData?.outcome || 'completed',
    });

    res.json({
      success: true,
      data: {
        sessionId,
        status: 'completed',
        summary: summaryData,
      },
    });
  } catch (error) {
    logger.error('VoiceCall.end', `Failed to end session ${sessionId}`, { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// GET /api/voice-call/:sessionId — Get session details from DB + session manager state
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

    const liveState = sessionManager.toJSON(sessionId);

    res.json({
      success: true,
      data: {
        ...callLog,
        liveState,
      },
    });
  } catch (error) {
    logger.error('VoiceCall.get', `Failed to get session ${sessionId}`, { error: String(error) });
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// POST /api/voice-call/callback-request — Queue a human callback
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

    logger.info('VoiceCall.callback', 'Callback requested', { phone: formattedPhone, reason, followupId: followup.id });

    res.status(201).json({ success: true, data: followup });
  } catch (error) {
    logger.error('VoiceCall.callback', 'Failed to create callback request', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// GET /api/voice-call — List recent sessions
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

    const enrichedSessions = sessions.map((s) => {
      const liveState = s.sessionId ? sessionManager.toJSON(s.sessionId) : null;
      return { ...s, liveState };
    });

    res.json({ success: true, data: enrichedSessions });
  } catch (error) {
    logger.error('VoiceCall.list', 'Failed to list sessions', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

export default router;
