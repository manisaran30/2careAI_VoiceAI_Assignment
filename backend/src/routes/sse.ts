import { Router, Request, Response } from 'express';
import { logger } from '../logger';

const router = Router();

interface SSEClient {
  id: string;
  res: Response;
  channels: Set<string>;
}

const clients: SSEClient[] = [];

function sendEvent(client: SSEClient, event: string, data: unknown): void {
  try {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch (err) {
    logger.error('SSE', 'Failed to send event to client', { clientId: client.id, error: err });
  }
}

export function broadcast(channel: string, event: string, data: unknown): void {
  const targetClients = clients.filter((c) => c.channels.has(channel));
  targetClients.forEach((client) => sendEvent(client, event, data));
  if (targetClients.length > 0) {
    logger.debug('SSE', `Broadcast ${event} on channel "${channel}" to ${targetClients.length} clients`);
  }
}

export function broadcastToSession(sessionId: string, event: string, data: unknown): void {
  broadcast(`session:${sessionId}`, event, data);
}

// GET /api/events — SSE stream. Query params: sessionId (optional), channel (optional)
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

  sendEvent(client, 'connected', { clientId: client.id, channels: [...client.channels] });

  logger.info('SSE', `Client ${client.id} connected`, { channels: [...client.channels] });

  // Keep connection alive
  const keepAlive = setInterval(() => {
    try {
      res.write(':keepalive\n\n');
    } catch {
      clearInterval(keepAlive);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(keepAlive);
    const idx = clients.indexOf(client);
    if (idx !== -1) clients.splice(idx, 1);
    logger.info('SSE', `Client ${client.id} disconnected`);
  });
});

export default router;
