import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { logger } from '../logger';

function parseBranch(branch: Record<string, unknown>) {
  return {
    ...branch,
    timings: typeof branch.timings === 'string' ? JSON.parse(branch.timings as string) : branch.timings,
    services: typeof branch.services === 'string' ? JSON.parse(branch.services as string) : branch.services,
  };
}

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const branches = await prisma.branch.findMany({
      where: { isActive: true },
      include: { _count: { select: { doctors: true } } },
      orderBy: { name: 'asc' },
    });

    const parsed = branches.map((b) => parseBranch(b as unknown as Record<string, unknown>));
    res.json({ success: true, data: parsed });
  } catch (error) {
    logger.error('Branches.list', 'Failed to fetch branches', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const branch = await prisma.branch.findUnique({
      where: { id: req.params.id },
      include: {
        doctors: {
          where: { isActive: true },
          include: { department: { select: { name: true } } },
          orderBy: { name: 'asc' },
        },
      },
    });

    if (!branch) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    const result = parseBranch(branch as unknown as Record<string, unknown>);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Branches.get', 'Failed to fetch branch', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

export default router;
