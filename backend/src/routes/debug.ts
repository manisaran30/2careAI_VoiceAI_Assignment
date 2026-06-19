import { Router, Request, Response } from 'express';

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

export default router;
