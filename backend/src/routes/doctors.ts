import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { logger } from '../logger';

const router = Router();

function parseDoctor(doctor: Record<string, unknown>) {
  return {
    ...doctor,
    languages: typeof doctor.languages === 'string' ? JSON.parse(doctor.languages as string) : doctor.languages,
    availableDays: typeof doctor.availableDays === 'string' ? JSON.parse(doctor.availableDays as string) : doctor.availableDays,
    qualifications: typeof doctor.qualifications === 'string' ? JSON.parse(doctor.qualifications as string) : doctor.qualifications,
    branch: doctor.branch ? parseBranch(doctor.branch as Record<string, unknown>) : doctor.branch,
  };
}

function parseBranch(branch: Record<string, unknown>) {
  if (!branch) return branch;
  return {
    ...branch,
    timings: typeof branch.timings === 'string' ? JSON.parse(branch.timings as string) : branch.timings,
    services: typeof branch.services === 'string' ? JSON.parse(branch.services as string) : branch.services,
  };
}

// GET /api/doctors - List doctors, optional ?specialty & ?branch filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const { specialty, branch } = req.query;

    const where: Record<string, unknown> = { isActive: true };
    if (specialty) {
      where.OR = [
        { specialty: { contains: specialty as string } },
        { department: { name: { contains: specialty as string } } },
      ];
    }
    if (branch) {
      where.branch = { name: { contains: branch as string } };
    }

    const doctors = await prisma.doctor.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });

    const parsed = doctors.map((d) => parseDoctor(d as unknown as Record<string, unknown>));

    res.json({ success: true, data: parsed });
  } catch (error) {
    logger.error('Doctors.list', 'Failed to fetch doctors', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// GET /api/doctors/:id - Get single doctor
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const doctor = await prisma.doctor.findUnique({
      where: { id: req.params.id },
      include: {
        branch: { select: { id: true, name: true, address: true, phone: true, timings: true } },
        department: { select: { id: true, name: true, description: true } },
      },
    });

    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    const result = parseDoctor(doctor as unknown as Record<string, unknown>);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Doctors.get', 'Failed to fetch doctor', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

export default router;
