import { Router, Request, Response } from 'express';
import { sessionManager } from '../voice/session-manager';
import { logger } from '../logger';

const router = Router();

interface SSEClient {
  id: string;
  res: Response;
  channels: Set<string>;
  sessionId: string | null;
  lastEventTime: number;
}

const clients: SSEClient[] = [];
const CLIENT_TIMEOUT = 5 * 60 * 1000;

function sendEvent(client: SSEClient, event: string, data: unknown): void {
  try {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch (err) {
    logger.error('SSE', 'Failed to send event to client', { clientId: client.id, error: err });
  }
}

export function broadcast(channel: string, event: string, data: unknown): void {
  const targetClients = clients.filter((c) => c.channels.has(channel));
  targetClients.forEach((client) => {
    sendEvent(client, event, data);
    client.lastEventTime = Date.now();
  });
}

export function broadcastToSession(sessionId: string, event: string, data: unknown): void {
  broadcast(`session:${sessionId}`, event, data);
}

// GET /api/events — SSE stream
router.get('/', (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string | undefined;
  const channel = req.query.channel as string | undefined;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const client: SSEClient = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    res,
    channels: new Set<string>(),
    sessionId: sessionId || null,
    lastEventTime: Date.now(),
  };

  if (sessionId) {
    client.channels.add(`session:${sessionId}`);
  }
  if (channel) {
    client.channels.add(channel);
  }
  if (client.channels.size === 0) {
    client.channels.add('global');
  }

  clients.push(client);

  // Send initial connection event with session snapshot if available
  const initialData: Record<string, unknown> = {
    clientId: client.id,
    channels: [...client.channels],
  };

  if (sessionId) {
    const session = sessionManager.toJSON(sessionId);
    if (session) {
      initialData.sessionState = session;
    }
  }

  sendEvent(client, 'connected', initialData);

  logger.info('SSE', `Client ${client.id} connected`, { channels: [...client.channels] });

  // Keep connection alive
  const keepAlive = setInterval(() => {
    try {
      res.write(':keepalive\n\n');
    } catch {
      clearInterval(keepAlive);
    }
  }, 15000);

  // Health check interval
  const healthCheck = setInterval(() => {
    const elapsed = Date.now() - client.lastEventTime;
    if (elapsed > CLIENT_TIMEOUT) {
      logger.warn('SSE', `Client ${client.id} timed out (${elapsed}ms inactive)`);
      try { res.end(); } catch { /* ignore */ }
      clearInterval(healthCheck);
    }
  }, 60000);

  req.on('close', () => {
    clearInterval(keepAlive);
    clearInterval(healthCheck);
    const idx = clients.indexOf(client);
    if (idx !== -1) clients.splice(idx, 1);
    logger.info('SSE', `Client ${client.id} disconnected`);
  });
});

export default router;
