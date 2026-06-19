import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { logger } from '../logger';

const router = Router();

// GET /api/patients/search?phone= - Find patient by phone
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { phone } = req.query;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const patient = await prisma.patient.findUnique({
      where: { phone: phone as string },
      include: {
        appointments: {
          orderBy: { date: 'desc' },
          take: 10,
          include: {
            doctor: { select: { name: true, specialty: true } },
            branch: { select: { name: true } },
          },
        },
        callLogs: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });

    if (!patient) {
      return res.json({ success: true, data: null, message: 'Patient not found' });
    }

    res.json({ success: true, data: patient });
  } catch (error) {
    logger.error('Patients.search', 'Failed to search patient', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /api/patients - Create or find existing patient
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, phone, email } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }

    const existing = await prisma.patient.findUnique({ where: { phone } });
    if (existing) {
      return res.json({ success: true, data: existing });
    }

    const patient = await prisma.patient.create({
      data: { name, phone, email },
    });

    res.status(201).json({ success: true, data: patient });
  } catch (error) {
    logger.error('Patients.create', 'Failed to create patient', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

export default router;
