"use client"

import { useCallback, useSyncExternalStore } from "react"
import { sessionStore, type SessionState } from "@/lib/call-session-store"
import { useCallSSE } from "./use-call-sse"
import { useCallTimer } from "./use-call-timer"
import { api } from "@/lib/api"

function useSessionSelector<Selected>(selector: (state: SessionState) => Selected): Selected {
  return useSyncExternalStore(
    sessionStore.subscribe,
    () => selector(sessionStore.getState()),
    () => selector(sessionStore.INITIAL_STATE),
  )
}

export function useSession() {
  const phase = useSessionSelector((s) => s.phase)
  const sessionId = useSessionSelector((s) => s.sessionId)
  const phone = useSessionSelector((s) => s.phone)
  const startTime = useSessionSelector((s) => s.startTime)
  const endTime = useSessionSelector((s) => s.endTime)
  const connectionStatus = useSessionSelector((s) => s.connectionStatus)
  const currentSpeaker = useSessionSelector((s) => s.currentSpeaker)
  const currentOperation = useSessionSelector((s) => s.currentOperation)
  const terminationReason = useSessionSelector((s) => s.terminationReason)
  const transcript = useSessionSelector((s) => s.transcript)
  const callSummary = useSessionSelector((s) => s.callSummary)
  const callOutcome = useSessionSelector((s) => s.callOutcome)
  const callAppointments = useSessionSelector((s) => s.callAppointments)
  const errorMessage = useSessionSelector((s) => s.errorMessage)
  const connectionLost = useSessionSelector((s) => s.connectionLost)

  // SSE connection — enabled during active call phases
  useCallSSE({
    sessionId,
    enabled: phase === "connecting" || phase === "connected" || phase === "ai_speaking" || phase === "user_speaking" || phase === "processing" || phase === "ending",
  })

  // Timer driven by connected phases
  const { formatted: timerFormatted, isRunning: timerRunning } = useCallTimer()

  const handleStartCall = useCallback(async (phoneNumber?: string) => {
    const p = (phoneNumber || "").trim()
    if (!p) return

    sessionStore.actions.startConnecting(p)

    try {
      const response = await api.voiceCall.initiate(p)
      if (response.data.status === "failed") {
        sessionStore.actions.setDisconnected(
          response.data.error || "Could not connect your call. Please check the number and try again.",
        )
      } else {
        sessionStore.actions.setConnected(response.data.sessionId)
      }
    } catch (err) {
      sessionStore.actions.setDisconnected(
        err instanceof Error ? err.message : "Could not connect your call. Please check the number and try again.",
      )
    }
  }, [])

  const handleEndCall = useCallback(async () => {
    const sid = sessionStore.getState().sessionId
    if (!sid) {
      sessionStore.actions.reset()
      return
    }

    sessionStore.actions.startEnding()

    try {
      await api.voiceCall.end(sid)
    } catch {
      // API error — SSE event or local fallback will handle completion
    }

    // If SSE hasn't already transitioned to completed, do it locally
    const current = sessionStore.getState()
    if (current.phase !== "completed") {
      sessionStore.actions.setCompleted({
        terminationReason: "user_ended",
      })
    }
  }, [])

  const handleCancelConnecting = useCallback(async () => {
    const sid = sessionStore.getState().sessionId
    if (sid) {
      try {
        await api.voiceCall.end(sid)
      } catch {
        // ignore
      }
    }
    sessionStore.actions.reset()
  }, [])

  const handleRetry = useCallback(() => {
    sessionStore.actions.reset()
  }, [])

  const handleRequestCallback = useCallback(async (reason: string) => {
    const p = sessionStore.getState().phone
    if (!p) return
    await api.voiceCall.requestCallback({ phone: p, reason })
    sessionStore.actions.reset()
  }, [])

  return {
    phase,
    sessionId,
    phone,
    startTime,
    endTime,
    connectionStatus,
    currentSpeaker,
    currentOperation,
    terminationReason,
    transcript,
    callSummary,
    callOutcome,
    callAppointments,
    errorMessage,
    connectionLost,
    timerFormatted,
    timerRunning,

    startCall: handleStartCall,
    endCall: handleEndCall,
    cancelConnecting: handleCancelConnecting,
    retry: handleRetry,
    requestCallback: handleRequestCallback,
    reset: sessionStore.actions.reset,
  }
}
