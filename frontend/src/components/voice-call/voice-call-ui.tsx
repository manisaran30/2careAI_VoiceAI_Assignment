"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { api } from "@/lib/api"
import { useCallSSE, type CallEvent } from "@/hooks/use-call-sse"
import { IdleState } from "./idle-state"
import { ConnectingState } from "./connecting-state"
import { ActiveState } from "./active-state"
import { ProcessingState } from "./processing-state"
import { CompleteState } from "./complete-state"
import { ErrorState } from "./error-state"

type CallPhase = "idle" | "connecting" | "active" | "processing" | "complete" | "error"

interface TranscriptEntry {
  speaker: string
  text: string
}

export function VoiceCallUI() {
  const [phase, setPhase] = useState<CallPhase>("idle")
  const [phone, setPhone] = useState("")
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState("Could not connect your call. Please check the number and try again.")
  const [operation, setOperation] = useState<string | null>(null)
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([])
  const [callOutcome, setCallOutcome] = useState<string>("")
  const [callSummary, setCallSummary] = useState<Record<string, unknown> | null>(null)
  const [callAppointments, setCallAppointments] = useState<any[] | undefined>(undefined)
  const [connectionLost, setConnectionLost] = useState(false)

  const [isAiSpeaking, setIsAiSpeaking] = useState(false)
  const [isUserSpeaking, setIsUserSpeaking] = useState(false)
  const speakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearSpeakingAfterDelay = useCallback(() => {
    if (speakTimerRef.current) clearTimeout(speakTimerRef.current)
    speakTimerRef.current = setTimeout(() => {
      setIsAiSpeaking(false)
      setIsUserSpeaking(false)
    }, 2000)
  }, [])

  const errorStateRef = useRef<string>(errorMessage)
  errorStateRef.current = errorMessage

  // Poll for session status when active (fallback if SSE misses completed event)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (!sessionId || phase !== "active") {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      return
    }
    pollRef.current = setInterval(async () => {
      try {
        const sessionData = await api.voiceCall.get(sessionId)
        if (sessionData.data?.status === "completed" || sessionData.data?.status === "failed") {
          if (sessionData.data?.conversationSummary) {
            setCallSummary(sessionData.data.conversationSummary)
            setCallOutcome(sessionData.data.conversationSummary.outcome || "completed")
          }
          setPhase("complete")
          setOperation(null)
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
        }
      } catch {
        setConnectionLost(true)
      }
    }, 10000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [sessionId, phase])

  const resetState = useCallback(() => {
    setPhase("idle")
    setSessionId(null)
    setOperation(null)
    setTranscripts([])
    setCallOutcome("")
    setCallSummary(null)
    setCallAppointments(undefined)
    setErrorMessage("Could not connect your call. Please check the number and try again.")
  }, [])

  const handleSSEEvent = useCallback((event: CallEvent) => {
    switch (event.type) {
      case "call.connecting":
        setPhase("connecting")
        break
      case "call.active":
        setPhase("active")
        break
      case "call.transcript": {
        const speaker = String(event.data.speaker || "unknown")
        setTranscripts((prev) => [
          ...prev,
          { speaker, text: String(event.data.text || "") },
        ])
        if (speaker === "ai") {
          setIsAiSpeaking(true)
          setIsUserSpeaking(false)
        } else {
          setIsUserSpeaking(true)
          setIsAiSpeaking(false)
        }
        clearSpeakingAfterDelay()
        break
      }
      case "call.operation":
        setOperation(String(event.data.operation || ""))
        setPhase("processing")
        break
      case "call.booking": {
        const apt = event.data.appointment as Record<string, unknown> | undefined
        if (apt) {
          setCallAppointments((prev) => [...(prev || []), apt])
        }
        setCallOutcome("booked")
        break
      }
      case "call.completed": {
        const summary = event.data.summary as Record<string, unknown> | undefined
        if (summary) {
          setCallSummary(summary)
          setCallOutcome(summary.outcome as string || "completed")
        } else {
          setCallOutcome("completed")
        }
        setPhase("complete")
        setOperation(null)
        break
      }
      case "call.error":
        setErrorMessage(String(event.data.message || errorStateRef.current))
        setPhase("error")
        setOperation(null)
        break
      case "call.status":
        // intermediate status update — stay in current phase
        break
    }
  }, [])

  const { disconnect } = useCallSSE({
    sessionId,
    onEvent: handleSSEEvent,
    enabled: phase === "connecting" || phase === "active" || phase === "processing",
  })

  const handleStartCall = useCallback(async () => {
    if (!phone.trim()) return

    setPhase("connecting")
    setTranscripts([])
    setOperation(null)
    setErrorMessage("Could not connect your call. Please check the number and try again.")

    try {
      const response = await api.voiceCall.initiate(phone)
      if (response.data.status === "failed") {
        setErrorMessage(response.data.error || errorStateRef.current)
        setPhase("error")
      } else {
        setSessionId(response.data.sessionId)
        if (response.data.status === "active") {
          setPhase("active")
        }
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : errorStateRef.current)
      setPhase("error")
    }
  }, [phone])

  const handleEndCall = useCallback(async () => {
    if (!sessionId) {
      resetState()
      return
    }

    setOperation("Ending call...")
    setPhase("processing")

    try {
      await api.voiceCall.end(sessionId)
      // Fetch the final session data for summary
      const sessionData = await api.voiceCall.get(sessionId)
      if (sessionData.data?.conversationSummary) {
        setCallSummary(sessionData.data.conversationSummary)
        setCallOutcome(sessionData.data.conversationSummary.outcome || "completed")
      }
      if (sessionData.data?.appointments?.length > 0) {
        setCallAppointments(sessionData.data.appointments)
      }
      setPhase("complete")
    } catch {
      setPhase("complete")
    }
    disconnect()
  }, [sessionId, disconnect, resetState])

  const handleCancelConnecting = useCallback(async () => {
    if (sessionId) {
      try {
        await api.voiceCall.end(sessionId)
      } catch {
        // ignore errors — just reset
      }
    }
    resetState()
  }, [sessionId, resetState])

  const handleRetry = useCallback(() => {
    resetState()
  }, [resetState])

  const handleRequestCallback = useCallback(async (reason: string) => {
    if (!phone.trim()) return
    await api.voiceCall.requestCallback({ phone, reason })
    resetState()
  }, [phone, resetState])

  const handleQuickExample = useCallback((_action: string) => {
    setPhone("9876543210")
  }, [])

  return (
    <div className="max-w-lg mx-auto">
      {connectionLost && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm text-center">
          Connection lost. Reconnecting...
        </div>
      )}
      {phase === "idle" && (
        <IdleState
          phone={phone}
          onPhoneChange={setPhone}
          onStartCall={handleStartCall}
          onQuickExample={handleQuickExample}
        />
      )}
      {phase === "connecting" && <ConnectingState onCancel={handleCancelConnecting} />}
      {phase === "active" && (
        <ActiveState
          operation={operation}
          isAiSpeaking={isAiSpeaking}
          isUserSpeaking={isUserSpeaking}
          onEndCall={handleEndCall}
        />
      )}
      {phase === "processing" && <ProcessingState message={operation || undefined} />}
      {phase === "complete" && (
        <CompleteState
          outcome={callOutcome}
          summary={callSummary as any}
          appointments={callAppointments}
          onStartNew={resetState}
        />
      )}
      {phase === "error" && (
        <ErrorState
          message={errorMessage}
          onRetry={handleRetry}
          onRequestCallback={handleRequestCallback}
        />
      )}

    </div>
  )
}
