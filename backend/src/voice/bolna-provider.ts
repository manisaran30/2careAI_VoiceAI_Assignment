import { VoiceProvider, CallParams, CallResult, CallStatus } from './provider';
import { logger } from '../logger';

const BOLNA_API_URL = process.env.BOLNA_API_URL || 'https://api.bolna.ai';

export class BolnaProvider implements VoiceProvider {
  private apiKey: string;
  private agentId: string;

  constructor() {
    this.apiKey = process.env.BOLNA_API_KEY || '';
    this.agentId = process.env.BOLNA_AGENT_ID || '';

    if (!this.apiKey || !this.agentId) {
      logger.warn('BolnaProvider', 'Bolna API key or agent ID not configured. Calls will fail.');
    }
  }

  async initiateCall(params: CallParams): Promise<CallResult> {
    logger.info('BolnaProvider.initiateCall', `Initiating call to ${params.recipientPhone}`);

    const body: Record<string, unknown> = {
      agent_id: this.agentId,
      recipient_phone_number: params.recipientPhone,
    };

    if (params.fromPhone) {
      body.from_phone_number = params.fromPhone;
    }

    if (params.userData) {
      body.user_data = params.userData;
    }

    const response = await fetch(`${BOLNA_API_URL}/call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      const errMsg = String(data.message || data.error || 'Failed to initiate call');
      logger.error('BolnaProvider.initiateCall', errMsg, data);
      throw new Error(errMsg);
    }

    logger.info('BolnaProvider.initiateCall', 'Call initiated', {
      executionId: data.execution_id,
      status: data.status,
    });

    return {
      executionId: String(data.execution_id || ''),
      status: String(data.status || 'queued'),
      message: String(data.message || ''),
    };
  }

  async endCall(executionId: string): Promise<void> {
    logger.info('BolnaProvider.endCall', `Ending call ${executionId}`);

    const response = await fetch(`${BOLNA_API_URL}/call/${executionId}/stop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      logger.error('BolnaProvider.endCall', 'Failed to end call', { executionId, error: data });
      throw new Error(String(data.message || 'Failed to end call'));
    }

    logger.info('BolnaProvider.endCall', `Call ${executionId} ended`);
  }

  async getCallStatus(executionId: string): Promise<CallStatus> {
    logger.debug('BolnaProvider.getCallStatus', `Fetching status for ${executionId}`);

    const response = await fetch(`${BOLNA_API_URL}/executions/${executionId}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      logger.error('BolnaProvider.getCallStatus', 'Failed to get status', { executionId, error: data });
      throw new Error(String(data.message || 'Failed to get call status'));
    }

    const data = (await response.json()) as Record<string, unknown>;

    return {
      status: String(data.status || 'unknown'),
      duration: typeof data.duration === 'number' ? data.duration : undefined,
      transcript: typeof data.transcript === 'string' ? data.transcript : undefined,
      summary: typeof data.summary === 'string' ? data.summary : undefined,
      error: typeof data.error === 'string' ? data.error : undefined,
    };
  }
}
