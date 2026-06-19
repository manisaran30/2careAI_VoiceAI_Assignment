import { prisma } from '../prisma';
import { broadcastToSession } from '../routes/sse';
import { withRetry } from '../middleware/retry';
import { logger } from '../logger';

export const VALID_TRANSITIONS: Record<CallState, CallState[]> = {
  idle: ['connecting'],
  connecting: ['connected', 'disconnected'],
  connected: ['ai_speaking', 'user_speaking', 'processing', 'ending', 'disconnected'],
  ai_speaking: ['user_speaking', 'processing', 'connected', 'idle', 'ending', 'disconnected'],
  user_speaking: ['ai_speaking', 'processing', 'connected', 'idle', 'ending', 'disconnected'],
  processing: ['connected', 'ai_speaking', 'user_speaking', 'ending', 'disconnected'],
  ending: ['completed', 'disconnected'],
  completed: ['idle'],
  disconnected: ['idle'],
};

export type CallState = 
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'ai_speaking'
  | 'user_speaking'
  | 'processing'
  | 'ending'
  | 'completed'
  | 'disconnected';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface TranscriptEntry {
  speaker: string;
  text: string;
  timestamp: string;
  isFinal?: boolean;
}

export interface AppointmentInfo {
  id?: string;
  doctor?: { name: string; specialty?: string };
  branch?: { name: string };
  date?: string;
  time?: string;
  status?: string;
}

export interface ConversationSummaryData {
  patientName?: string | null;
  intent?: string | null;
  doctor?: string | null;
  department?: string | null;
  branch?: string | null;
  appointmentTime?: string | null;
  outcome?: string | null;
  callDuration?: number | null;
  summary?: string | null;
}

export interface SessionData {
  sessionId: string;
  state: CallState;
  phone: string;
  callLogId: string | null;
  executionId: string | null;
  patientId: string | null;
  startTime: number | null;
  endTime: number | null;
  connectionStatus: ConnectionStatus;
  currentSpeaker: 'ai' | 'user' | null;
  currentOperation: string | null;
  terminationReason: string | null;
  transcript: TranscriptEntry[];
  errorLog: string[];
  appointments: AppointmentInfo[];
  summary: ConversationSummaryData | null;
  createdAt: number;
  updatedAt: number;
}

export type TransitionListener = (sessionId: string, from: CallState, to: CallState, session: SessionData) => void;

class SessionManager {
  private sessions = new Map<string, SessionData>();
  private transitionListeners: TransitionListener[] = [];
  private maxSessions = 100;

  onTransition(listener: TransitionListener): void {
    this.transitionListeners.push(listener);
  }

  private emitTransition(sessionId: string, from: CallState, to: CallState, session: SessionData): void {
    for (const listener of this.transitionListeners) {
      try {
        listener(sessionId, from, to, session);
      } catch (err) {
        logger.error('SessionManager', 'Transition listener error', { error: String(err) });
      }
    }
  }

  private broadcastEvent(sessionId: string, event: string, data: unknown): void {
    try {
      broadcastToSession(sessionId, event, data);
    } catch {
      // ignore broadcast errors
    }
  }

  getSession(sessionId: string): SessionData | undefined {
    return this.sessions.get(sessionId);
  }

  hasActiveSession(): string | null {
    for (const [id, session] of this.sessions) {
      if (!['completed', 'disconnected', 'idle'].includes(session.state)) {
        return id;
      }
    }
    return null;
  }

  createSession(sessionId: string, phone: string): SessionData {
    const session: SessionData = {
      sessionId,
      state: 'idle',
      phone,
      callLogId: null,
      executionId: null,
      patientId: null,
      startTime: null,
      endTime: null,
      connectionStatus: 'connecting',
      currentSpeaker: null,
      currentOperation: null,
      terminationReason: null,
      transcript: [],
      errorLog: [],
      appointments: [],
      summary: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    if (this.sessions.size >= this.maxSessions) {
      const oldest = [...this.sessions.entries()]
        .sort(([, a], [, b]) => a.createdAt - b.createdAt)[0];
      if (oldest) this.sessions.delete(oldest[0]);
    }

    this.sessions.set(sessionId, session);
    return session;
  }

  transition(sessionId: string, newState: CallState, metadata?: Partial<SessionData>): SessionData {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const oldState = session.state;

    if (oldState === newState) {
      if (metadata) {
        this.applyMetadata(session, metadata);
        session.updatedAt = Date.now();
      }
      return session;
    }

    // Validate transitions for idle->completed, etc. that skip intermediate states
    if (oldState === 'idle' && (newState === 'completed' || newState === 'disconnected')) {
      // Allow direct transition from idle to completed/disconnected for cleanup
    }

    const allowed = VALID_TRANSITIONS[oldState];
    if (!allowed.includes(newState)) {
      logger.error('SessionManager', `Invalid transition: ${oldState} -> ${newState} for session ${sessionId}`);
      throw new Error(`Invalid state transition: ${oldState} -> ${newState}`);
    }

    const wasActive = !['completed', 'disconnected', 'idle'].includes(oldState);
    const isActive = !['completed', 'disconnected', 'idle'].includes(newState);

    session.state = newState;
    session.updatedAt = Date.now();

    if (newState === 'connected' && !session.startTime) {
      session.startTime = Date.now();
    }

    if (newState === 'completed' || newState === 'disconnected') {
      session.endTime = Date.now();
    }

    if (metadata) {
      this.applyMetadata(session, metadata);
    }

    if (newState === 'disconnected' && !session.terminationReason && metadata?.errorLog) {
      session.errorLog = [...session.errorLog, ...metadata.errorLog];
    }

    const eventMap: Partial<Record<CallState, string>> = {
      connecting: 'call.connecting',
      connected: 'call.connected',
      ai_speaking: 'call.state',
      user_speaking: 'call.state',
      processing: 'call.operation',
      ending: 'call.ending',
      completed: 'call.completed',
      disconnected: 'call.disconnected',
    };

    const eventType = eventMap[newState] || 'call.status';
    const speakerEvent = newState === 'ai_speaking' ? 'ai' : newState === 'user_speaking' ? 'user' : null;

    if (speakerEvent) {
      this.broadcastEvent(sessionId, 'call.speaker', { speaker: speakerEvent, sessionId });
    } else if (newState === 'processing') {
      this.broadcastEvent(sessionId, eventType, {
        sessionId,
        operation: session.currentOperation,
      });
    } else {
      const payload: Record<string, unknown> = {
        sessionId,
        state: newState,
        ...this.getPublicSessionData(session),
      };
      if (newState === 'completed' || newState === 'disconnected') {
        payload.summary = session.summary;
        payload.terminationReason = session.terminationReason;
        payload.appointments = session.appointments;
      }
      this.broadcastEvent(sessionId, eventType, payload);
    }

    this.persistState(session, oldState).catch((err) => {
      logger.error('SessionManager', `Failed to persist state for ${sessionId}`, { error: String(err) });
    });

    this.emitTransition(sessionId, oldState, newState, session);
    return session;
  }

  appendTranscript(sessionId: string, entry: TranscriptEntry): SessionData {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    session.transcript = [...session.transcript, entry];
    session.updatedAt = Date.now();

    this.broadcastEvent(sessionId, 'call.transcript', {
      sessionId,
      speaker: entry.speaker,
      text: entry.text,
      isFinal: entry.isFinal,
    });

    return session;
  }

  setOperation(sessionId: string, operation: string): SessionData {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    session.currentOperation = operation;
    session.updatedAt = Date.now();

    this.broadcastEvent(sessionId, 'call.operation', {
      sessionId,
      operation,
    });

    return session;
  }

  addAppointment(sessionId: string, appointment: AppointmentInfo): SessionData {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    session.appointments = [...session.appointments, appointment];
    session.updatedAt = Date.now();

    this.broadcastEvent(sessionId, 'call.booking', {
      sessionId,
      appointment,
    });

    return session;
  }

  setSummary(sessionId: string, summary: ConversationSummaryData): SessionData {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    session.summary = summary;
    session.updatedAt = Date.now();
    return session;
  }

  getPublicSessionData(session: SessionData): Record<string, unknown> {
    return {
      sessionId: session.sessionId,
      state: session.state,
      phone: session.phone,
      startTime: session.startTime,
      endTime: session.endTime,
      connectionStatus: session.connectionStatus,
      currentSpeaker: session.currentSpeaker,
      currentOperation: session.currentOperation,
      terminationReason: session.terminationReason,
    };
  }

  toJSON(sessionId: string): Record<string, unknown> | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return {
      sessionId: session.sessionId,
      state: session.state,
      phone: session.phone,
      callLogId: session.callLogId,
      executionId: session.executionId,
      patientId: session.patientId,
      startTime: session.startTime,
      endTime: session.endTime,
      connectionStatus: session.connectionStatus,
      currentSpeaker: session.currentSpeaker,
      currentOperation: session.currentOperation,
      terminationReason: session.terminationReason,
      transcript: session.transcript,
      appointments: session.appointments,
      summary: session.summary,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  private applyMetadata(session: SessionData, metadata: Partial<SessionData>): void {
    if (metadata.connectionStatus) session.connectionStatus = metadata.connectionStatus;
    if (metadata.currentSpeaker !== undefined) session.currentSpeaker = metadata.currentSpeaker;
    if (metadata.currentOperation !== undefined) session.currentOperation = metadata.currentOperation;
    if (metadata.terminationReason) session.terminationReason = metadata.terminationReason;
    if (metadata.executionId) session.executionId = metadata.executionId;
    if (metadata.callLogId) session.callLogId = metadata.callLogId;
    if (metadata.patientId) session.patientId = metadata.patientId;
    if (metadata.summary) session.summary = metadata.summary;
    if (metadata.appointments) session.appointments = metadata.appointments;
    if (metadata.errorLog) session.errorLog = [...session.errorLog, ...metadata.errorLog];
  }

  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  getAllActiveSessions(): SessionData[] {
    return [...this.sessions.values()].filter(
      (s) => !['completed', 'disconnected', 'idle'].includes(s.state),
    );
  }

  private async persistState(session: SessionData, previousState: CallState): Promise<void> {
    if (!session.callLogId) return;

    const dbStatus = session.state === 'connected' || session.state === 'ai_speaking' || session.state === 'user_speaking'
      ? 'active'
      : session.state;

    try {
      const updateData: Record<string, unknown> = {
        status: dbStatus,
        updatedAt: new Date(),
      };

      if (session.startTime) {
        updateData.duration = Math.floor((Date.now() - session.startTime) / 1000);
      }

      if (session.currentOperation) {
        updateData.operation = session.currentOperation;
      }

      if (session.currentSpeaker) {
        updateData.metadata = JSON.stringify({ currentSpeaker: session.currentSpeaker });
      }

      if (session.transcript.length > 0 && previousState !== session.state) {
        updateData.transcript = JSON.stringify(session.transcript);
      }

      if (session.state === 'completed' || session.state === 'disconnected') {
        updateData.transcript = JSON.stringify(session.transcript);
        if (session.summary?.summary) {
          updateData.summary = session.summary.summary;
        }
      }

      await withRetry(() =>
        prisma.callLog.update({
          where: { id: session.callLogId! },
          data: updateData as any,
        }),
        'SessionManager.persist',
      ).catch(() => {});
    } catch {
      // non-critical
    }
  }

  cleanup(): number {
    const now = Date.now();
    const STALE_TIMEOUT = 30 * 60 * 1000;
    let cleaned = 0;

    for (const [id, session] of this.sessions) {
      if (['completed', 'disconnected'].includes(session.state) && (now - session.updatedAt) > STALE_TIMEOUT) {
        this.sessions.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }
}

export const sessionManager = new SessionManager();
