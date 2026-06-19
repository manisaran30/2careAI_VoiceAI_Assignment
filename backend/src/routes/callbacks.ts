import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { logger } from '../logger';

const router = Router();

// POST /api/callbacks - Create human follow-up request
router.post('/', async (req: Request, res: Response) => {
  try {
    const { patientId, reason, notes, callLogId } = req.body;

    if (!patientId || !reason) {
      return res.status(400).json({ error: 'patientId and reason are required' });
    }

    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const followup = await prisma.humanFollowup.create({
      data: {
        patientId,
        reason,
        notes: notes || null,
        callLogId: callLogId || null,
        status: 'pending',
      },
      include: {
        patient: { select: { name: true, phone: true } },
      },
    });

    res.status(201).json({ success: true, data: followup });
  } catch (error) {
    logger.error('Callbacks.create', 'Failed to create follow-up', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// GET /api/callbacks - List follow-ups
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    const followups = await prisma.humanFollowup.findMany({
      where,
      include: {
        patient: { select: { name: true, phone: true } },
        callLog: { select: { callId: true, summary: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: followups });
  } catch (error) {
    logger.error('Callbacks.list', 'Failed to fetch follow-ups', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// PATCH /api/callbacks/:id - Update follow-up status
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { status, notes } = req.body;
    const validStatuses = ['pending', 'contacted', 'resolved'];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
    }

    const followup = await prisma.humanFollowup.findUnique({ where: { id: req.params.id } });
    if (!followup) {
      return res.status(404).json({ error: 'Follow-up not found' });
    }

    const updated = await prisma.humanFollowup.update({
      where: { id: req.params.id },
      data: {
        status,
        ...(notes !== undefined ? { notes } : {}),
      },
      include: {
        patient: { select: { name: true, phone: true } },
      },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    logger.error('Callbacks.update', 'Failed to update follow-up', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

export default router;
