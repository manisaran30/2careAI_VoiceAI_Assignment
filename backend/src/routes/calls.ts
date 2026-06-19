import { Router, Request, Response } from 'express';
import { logger } from '../logger';

const router = Router();

const BOLNA_API_URL = 'https://api.bolna.ai/call';
const BOLNA_AGENT_ID = process.env.BOLNA_AGENT_ID;
const BOLNA_API_KEY = process.env.BOLNA_API_KEY;

interface BolnaResponse {
  message?: string;
  status?: string;
  execution_id?: string;
}

router.post('/initiate', async (req: Request, res: Response) => {
  try {
    const { recipient_phone_number } = req.body;

    if (!recipient_phone_number) {
      return res.status(400).json({ error: 'recipient_phone_number is required' });
    }

    if (!BOLNA_AGENT_ID || !BOLNA_API_KEY) {
      return res.status(500).json({ error: 'Bolna API not configured' });
    }

    const response = await fetch(BOLNA_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BOLNA_API_KEY}`,
      },
      body: JSON.stringify({
        agent_id: BOLNA_AGENT_ID,
        recipient_phone_number,
      }),
    });

    const data = await response.json() as BolnaResponse;

    if (!response.ok) {
      logger.error('Calls.initiate', 'Bolna API error', { error: data });

      const errorMessage = 'Unable to connect the call. Please try again.';
      return res.status(response.status).json({ error: errorMessage });
    }

    res.json({
      success: true,
      data: {
        message: data.message || '',
        status: data.status || 'queued',
        execution_id: data.execution_id || '',
      },
    });
  } catch (error) {
    logger.error('Calls.initiate', 'Failed to initiate call', { error: String(error) });
    res.status(500).json({ error: 'Unable to connect the call. Please try again.' });
  }
});

export default router;
