import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';

interface RecentRequest {
  method: string;
  path: string;
  status: number;
  duration: number;
  timestamp: string;
}

const recentRequests: RecentRequest[] = [];
const MAX_REQUESTS = 100;

export function recordRequest(method: string, path: string, status: number, duration: number): void {
  recentRequests.push({ method, path, status, duration, timestamp: new Date().toISOString() });
  if (recentRequests.length > MAX_REQUESTS) {
    recentRequests.splice(0, recentRequests.length - MAX_REQUESTS);
  }
}

export function getRecentRequests(): RecentRequest[] {
  return [...recentRequests];
}

const router = Router();

router.get('/recent-requests', (_req: Request, res: Response) => {
  res.json({ success: true, data: getRecentRequests() });
});

router.get('/db-check', async (_req: Request, res: Response) => {
  try {
    const hasDbUrl = !!process.env.DATABASE_URL;
    const dbUrlPrefix = process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 30) + '...' : 'not set';
    const start = Date.now();
    await prisma.$connect();
    const connectTime = Date.now() - start;
    const result = await prisma.$queryRaw`SELECT 1 as connected`;
    const queryTime = Date.now() - start;
    await prisma.branch.count();
    const countTime = Date.now() - start;
    res.json({
      success: true,
      data: {
        databaseUrlSet: hasDbUrl,
        databaseUrlPrefix: dbUrlPrefix,
        connectTimeMs: connectTime,
        queryTimeMs: queryTime,
        countTimeMs: countTime - queryTime,
        queryResult: result,
      },
    });
  } catch (error) {
    res.json({
      success: false,
      error: String(error),
      env: {
        databaseUrlSet: !!process.env.DATABASE_URL,
        databaseUrlPrefix: process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 30) + '...' : 'not set',
        nodeEnv: process.env.NODE_ENV,
      },
    });
  }
});

export default router;
