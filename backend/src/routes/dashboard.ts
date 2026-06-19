import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { logger } from '../logger';

const router = Router();

// GET /api/dashboard/stats - Dashboard summary
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      todayCalls,
      todayAppointments,
      missedCalls,
      pendingFollowups,
      todayBooked,
      todayCancelled,
      todayRescheduled,
      totalPatients,
      totalDoctors,
    ] = await Promise.all([
      prisma.callLog.count({ where: { createdAt: { gte: today, lt: tomorrow } } }),
      prisma.appointment.count({ where: { date: { gte: today, lt: tomorrow }, status: { not: 'cancelled' } } }),
      prisma.callLog.count({ where: { status: 'missed', createdAt: { gte: today, lt: tomorrow } } }),
      prisma.humanFollowup.count({ where: { status: 'pending' } }),
      prisma.appointment.count({ where: { date: { gte: today, lt: tomorrow }, status: 'scheduled', source: 'ai' } }),
      prisma.appointment.count({ where: { date: { gte: today, lt: tomorrow }, status: 'cancelled' } }),
      prisma.appointment.count({ where: { date: { gte: today, lt: tomorrow }, status: 'rescheduled' } }),
      prisma.patient.count(),
      prisma.doctor.count({ where: { isActive: true } }),
    ]);

    res.json({
      success: true,
      data: {
        todayCalls,
        todayAppointments,
        missedCalls,
        pendingFollowups,
        todayBooked,
        todayCancelled,
        todayRescheduled,
        totalPatients,
        totalDoctors,
      },
    });
  } catch (error) {
    logger.error('Dashboard.stats', 'Failed to fetch dashboard stats', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// GET /api/dashboard/recent - Recent activity
router.get('/recent', async (_req: Request, res: Response) => {
  try {
    const [recentCalls, recentAppointments, followups] = await Promise.all([
      prisma.callLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          patient: { select: { name: true, phone: true } },
          conversationSummary: true,
        },
      }),
      prisma.appointment.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          patient: { select: { name: true, phone: true } },
          doctor: { select: { name: true, specialty: true } },
          branch: { select: { name: true } },
        },
      }),
      prisma.humanFollowup.findMany({
        where: { status: 'pending' },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          patient: { select: { name: true, phone: true } },
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        recentCalls,
        recentAppointments,
        pendingFollowups: followups,
      },
    });
  } catch (error) {
    logger.error('Dashboard.recent', 'Failed to fetch recent activity', { error: String(error) });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

export default router;
