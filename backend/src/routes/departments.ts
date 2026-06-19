import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { logger } from '../logger';

const router = Router();

// GET /api/departments - List all departments
router.get('/', async (_req: Request, res: Response) => {
  try {
    const departments = await prisma.department.findMany({
      where: { isActive: true },
      include: {
        _count: { select: { doctors: true } },
      },
      orderBy: { name: 'asc' },
    });

    res.json({ success: true, data: departments });
  } catch (error) {
    logger.error('Departments.list', 'Failed to fetch departments', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// GET /api/departments/:id - Get single department with doctors
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const department = await prisma.department.findUnique({
      where: { id: req.params.id },
      include: {
        doctors: {
          where: { isActive: true },
          include: { branch: { select: { name: true } } },
          orderBy: { name: 'asc' },
        },
      },
    });

    if (!department) {
      return res.status(404).json({ error: 'Department not found' });
    }

    res.json({ success: true, data: department });
  } catch (error) {
    logger.error('Departments.get', 'Failed to fetch department', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

export default router;
