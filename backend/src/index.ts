import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import doctorsRouter from './routes/doctors';
import departmentsRouter from './routes/departments';
import patientsRouter from './routes/patients';
import appointmentsRouter from './routes/appointments';
import dashboardRouter from './routes/dashboard';
import callbacksRouter from './routes/callbacks';
import webhooksRouter from './routes/webhooks';
import callsRouter from './routes/calls';
import voiceCallRouter from './routes/voice-call';
import branchesRouter from './routes/branches';
import sseRouter from './routes/sse';
import evaluationsRouter from './routes/evaluations';
import slotsRouter from './routes/slots';
import bookingsRouter from './routes/bookings';
import debugRouter, { recordRequest } from './routes/debug';
import { prisma } from './prisma';
import { configureProvider } from './voice/provider-registry';
import { sessionManager } from './voice/session-manager';
import { logger } from './logger';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const originalEnd = res.end.bind(res);
  res.end = ((...args: Parameters<typeof originalEnd>) => {
    const duration = Date.now() - start;
    logger.info('HTTP', `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
    recordRequest(req.method, req.originalUrl, res.statusCode, duration);
    return originalEnd(...args);
  }) as typeof originalEnd;
  next();
});

// Initialize voice provider
configureProvider();

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/doctors', doctorsRouter);
app.use('/api/departments', departmentsRouter);
app.use('/api/patients', patientsRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/callbacks', callbacksRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/calls', callsRouter);
app.use('/api/voice-call', voiceCallRouter);
app.use('/api/branches', branchesRouter);
app.use('/api/events', sseRouter);
app.use('/api/evaluations', evaluationsRouter);
app.use('/api/slots', slotsRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/debug', debugRouter);

// Global error handler — never expose raw errors to client
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Server', 'Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

// Periodic cleanup: mark sessions stuck in active/connecting for >5min as incomplete
const CLEANUP_INTERVAL = 60_000;
const STALE_THRESHOLD = 5 * 60_000;
setInterval(async () => {
  try {
    // Clean in-memory stale sessions
    const cleaned = sessionManager.cleanup();
    if (cleaned > 0) {
      logger.info('SessionCleanup', `Cleaned ${cleaned} stale sessions from memory`);
    }

    // Mark DB sessions stuck in active/connecting for >5min as incomplete
    const cutoff = new Date(Date.now() - STALE_THRESHOLD);
    const stale = await prisma.callLog.updateMany({
      where: {
        status: { in: ['active', 'connecting'] },
        updatedAt: { lt: cutoff },
      },
      data: { status: 'incomplete', partialSession: true },
    });
    if (stale.count > 0) {
      logger.info('SessionCleanup', `Marked ${stale.count} stale DB sessions as incomplete`);

      // Also disconnect in-memory sessions that match stale records
      const staleRecords = await prisma.callLog.findMany({
        where: {
          status: 'incomplete',
          partialSession: true,
          updatedAt: { lt: cutoff },
        },
        select: { sessionId: true },
      });
      for (const record of staleRecords) {
        if (!record.sessionId) continue;
        try {
          const s = sessionManager.getSession(record.sessionId);
          if (s && !['completed', 'disconnected', 'idle'].includes(s.state)) {
            sessionManager.transition(record.sessionId, 'disconnected', {
              terminationReason: 'stale_timeout',
            });
          }
        } catch {
          // ignore
        }
      }
    }
  } catch (err) {
    logger.error('SessionCleanup', 'Cleanup failed', { error: String(err) });
  }
}, CLEANUP_INTERVAL);

// Ensure appointment_slots table exists at startup
(async () => {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "appointment_slots" (
        "id" TEXT PRIMARY KEY,
        "doctorId" TEXT NOT NULL REFERENCES "doctors"("id"),
        "date" TIMESTAMPTZ NOT NULL,
        "time" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'available',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    logger.info('DB', 'appointment_slots table ready');
  } catch (err) {
    logger.error('DB', 'Failed to create appointment_slots table', { error: String(err) });
  }
})();

app.listen(PORT, () => {
  logger.info('Server', `Server running on http://localhost:${PORT}`);
});

export default app;
