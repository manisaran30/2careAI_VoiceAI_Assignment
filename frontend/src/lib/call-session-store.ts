"use client"

export type CallPhase =
  | "idle"
  | "connecting"
  | "connected"
  | "ai_speaking"
  | "user_speaking"
  | "processing"
  | "ending"
  | "completed"
  | "disconnected"

export interface TranscriptEntry {
  speaker: string
  text: string
  timestamp?: string
  isFinal?: boolean
}

export interface AppointmentInfo {
  id?: string
  doctor?: { name: string; specialty?: string }
  branch?: { name: string }
  date?: string
  time?: string
  status?: string
}

export interface SessionState {
  phase: CallPhase
  sessionId: string | null
  phone: string
  startTime: number | null
  endTime: number | null
  connectionStatus: "connecting" | "connected" | "disconnected"
  currentSpeaker: "ai" | "user" | null
  currentOperation: string | null
  terminationReason: string | null
  transcript: TranscriptEntry[]
  callSummary: Record<string, unknown> | null
  callOutcome: string
  callAppointments: AppointmentInfo[]
  errorMessage: string
  connectionLost: boolean
}

const VALID_TRANSITIONS: Record<CallPhase, CallPhase[]> = {
  idle: ["connecting"],
  connecting: ["connected", "disconnected"],
  connected: ["ai_speaking", "user_speaking", "processing", "ending", "disconnected"],
  ai_speaking: ["user_speaking", "processing", "connected", "idle", "ending", "disconnected"],
  user_speaking: ["ai_speaking", "processing", "connected", "idle", "ending", "disconnected"],
  processing: ["connected", "ai_speaking", "user_speaking", "ending", "disconnected"],
  ending: ["completed", "disconnected"],
  completed: ["idle"],
  disconnected: ["idle"],
}

const INITIAL_STATE: SessionState = {
  phase: "idle",
  sessionId: null,
  phone: "",
  startTime: null,
  endTime: null,
  connectionStatus: "connecting",
  currentSpeaker: null,
  currentOperation: null,
  terminationReason: null,
  transcript: [],
  callSummary: null,
  callOutcome: "",
  callAppointments: [],
  errorMessage: "Could not connect your call. Please check the number and try again.",
  connectionLost: false,
}

type Reducer = (prev: SessionState) => SessionState
type Listener = () => void

let state: SessionState = { ...INITIAL_STATE }
const listeners = new Set<Listener>()

function getState(): SessionState {
  return state
}

function setState(reducer: Reducer): void {
  const next = reducer(state)
  if (next !== state) {
    state = next
    listeners.forEach((l) => l())
  }
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function validateTransition(from: CallPhase, to: CallPhase): boolean {
  const allowed = VALID_TRANSITIONS[from]
  if (!allowed) return false
  if (allowed.includes(to)) return true

  if (process.env.NODE_ENV === "development") {
    console.warn(`[SessionStore] Invalid transition: ${from} -> ${to}`)
  }
  return false
}

function resetState(): void {
  state = { ...INITIAL_STATE }
  listeners.forEach((l) => l())
}

function transition(newPhase: CallPhase, extra?: Partial<SessionState>): void {
  setState((prev) => {
    if (!validateTransition(prev.phase, newPhase)) {
      return prev
    }
    return {
      ...prev,
      ...extra,
      phase: newPhase,
    }
  })
}

const actions = {
  startConnecting(phone: string): void {
    transition("connecting", {
      phone,
      sessionId: null,
      startTime: null,
      endTime: null,
      transcript: [],
      callSummary: null,
      callOutcome: "",
      callAppointments: [],
      currentOperation: null,
      currentSpeaker: null,
      terminationReason: null,
      errorMessage: "Could not connect your call. Please check the number and try again.",
      connectionLost: false,
    })
  },

  setConnected(sessionId: string): void {
    transition("connected", {
      sessionId,
      connectionStatus: "connected",
      startTime: state.startTime ?? Date.now(),
    })
  },

  setAiSpeaking(): void {
    transition("ai_speaking", { currentSpeaker: "ai" })
  },

  setUserSpeaking(): void {
    transition("user_speaking", { currentSpeaker: "user" })
  },

  setIdle(): void {
    transition("idle")
  },

  setProcessing(operation: string): void {
    transition("processing", { currentOperation: operation })
  },

  startEnding(): void {
    transition("ending", { currentOperation: "Ending call..." })
  },

  setCompleted(data?: {
    summary?: Record<string, unknown> | null
    outcome?: string
    appointments?: AppointmentInfo[]
    terminationReason?: string
  }): void {
    transition("completed", {
      endTime: Date.now(),
      currentSpeaker: null,
      currentOperation: null,
      connectionStatus: "disconnected",
      callSummary: data?.summary ?? state.callSummary,
      callOutcome: data?.outcome ?? state.callOutcome,
      callAppointments: data?.appointments ?? state.callAppointments,
      terminationReason: data?.terminationReason ?? state.terminationReason,
    })
  },

  setDisconnected(error: string, reason?: string): void {
    transition("disconnected", {
      endTime: Date.now(),
      connectionStatus: "disconnected",
      currentSpeaker: null,
      currentOperation: null,
      errorMessage: error,
      terminationReason: reason ?? null,
    })
  },

  appendTranscript(entry: TranscriptEntry): void {
    setState((prev) => {
      if (["completed", "disconnected", "idle"].includes(prev.phase)) {
        return prev
      }
      return {
        ...prev,
        transcript: [...prev.transcript, entry],
      }
    })
  },

  setOperation(operation: string): void {
    setState((prev) => ({
      ...prev,
      currentOperation: operation,
    }))
  },

  addAppointment(appointment: AppointmentInfo): void {
    setState((prev) => ({
      ...prev,
      callAppointments: [...prev.callAppointments, appointment],
      callOutcome: "booked",
    }))
  },

  setConnectionLost(lost: boolean): void {
    setState((prev) => ({
      ...prev,
      connectionLost: lost,
    }))
  },

  restoreFromEvent(stateData: Record<string, unknown>): void {
    setState((prev) => ({
      ...prev,
      sessionId: (stateData.sessionId as string) ?? prev.sessionId,
      startTime: (stateData.startTime as number) ?? prev.startTime,
      endTime: (stateData.endTime as number) ?? prev.endTime,
      connectionStatus: (stateData.connectionStatus as SessionState["connectionStatus"]) ?? prev.connectionStatus,
      currentSpeaker: (stateData.currentSpeaker as SessionState["currentSpeaker"]) ?? prev.currentSpeaker,
      currentOperation: (stateData.currentOperation as string) ?? prev.currentOperation,
      terminationReason: (stateData.terminationReason as string) ?? prev.terminationReason,
    }))
  },

  reset(): void {
    resetState()
  },
}

export const sessionStore = {
  getState,
  subscribe,
  actions,
  INITIAL_STATE,
}

export const SESSION_EVENT_TYPES = [
  "call.connecting",
  "call.connected",
  "call.transcript",
  "call.operation",
  "call.booking",
  "call.speaker",
  "call.state",
  "call.ending",
  "call.completed",
  "call.disconnected",
  "call.error",
  "call.status",
] as const

export type SessionEventType = (typeof SESSION_EVENT_TYPES)[number]

export interface CallEvent {
  type: SessionEventType
  data: Record<string, unknown>
}
