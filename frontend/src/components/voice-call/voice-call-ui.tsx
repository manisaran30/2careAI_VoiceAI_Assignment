"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { useSession } from "@/hooks/use-session"
import { IdleState } from "./idle-state"
import { ConnectingState } from "./connecting-state"
import { ActiveState } from "./active-state"
import { ProcessingState } from "./processing-state"
import { CompleteState } from "./complete-state"
import { ErrorState } from "./error-state"
import { LiveTranscript } from "./live-transcript"
import { DebugPanel } from "./debug-panel"

export function VoiceCallUI() {
  const session = useSession()
  const [phone, setPhone] = useState("")
  const phoneRef = useRef(phone)
  phoneRef.current = phone

  const handleStartCall = useCallback(() => {
    session.startCall(phone)
  }, [session.startCall, phone])

  const handleQuickExample = useCallback((_action: string) => {
    setPhone("9876543210")
  }, [])

  // Debounced speaker: keep showing indicator for 2s after last transcript
  const [displaySpeaker, setDisplaySpeaker] = useState<"ai" | "user" | null>(null)
  const speakerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (session.currentSpeaker) {
      setDisplaySpeaker(session.currentSpeaker)
      if (speakerTimerRef.current) clearTimeout(speakerTimerRef.current)
      speakerTimerRef.current = setTimeout(() => {
        setDisplaySpeaker(null)
      }, 2000)
    }
    return () => {
      if (speakerTimerRef.current) clearTimeout(speakerTimerRef.current)
    }
  }, [session.currentSpeaker, session.transcript])

  const showTranscript =
    session.phase === "connected" ||
    session.phase === "ai_speaking" ||
    session.phase === "user_speaking" ||
    session.phase === "processing"

  const showTimer =
    session.phase === "connected" ||
    session.phase === "ai_speaking" ||
    session.phase === "user_speaking" ||
    session.phase === "processing"

  return (
    <div className="max-w-lg mx-auto space-y-4">
      {/* Connection lost banner */}
      {session.connectionLost && (
        <div className="px-4 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm text-center">
          Connection lost. Reconnecting...
        </div>
      )}

      {/* Phase-based UI */}
      {session.phase === "idle" && (
        <IdleState
          phone={phone}
          onPhoneChange={setPhone}
          onStartCall={handleStartCall}
          onQuickExample={handleQuickExample}
        />
      )}

      {session.phase === "connecting" && (
        <ConnectingState onCancel={session.cancelConnecting} />
      )}

      {(showTimer || session.phase === "ending") && (
        <ActiveState
          operation={session.phase === "ending" ? "Ending call..." : session.currentOperation}
          isAiSpeaking={displaySpeaker === "ai"}
          isUserSpeaking={displaySpeaker === "user"}
          timer={session.timerFormatted}
          onEndCall={session.endCall}
        />
      )}

      {session.phase === "processing" && (
        <ProcessingState message={session.currentOperation || undefined} />
      )}

      {session.phase === "completed" && (
        <CompleteState
          outcome={session.callOutcome}
          summary={session.callSummary as any}
          appointments={session.callAppointments}
          onStartNew={session.reset}
        />
      )}

      {session.phase === "disconnected" && (
        <ErrorState
          message={session.errorMessage}
          onRetry={session.retry}
          onRequestCallback={session.requestCallback}
        />
      )}

      {/* Live transcript during active call */}
      {showTranscript && session.transcript.length > 0 && (
        <LiveTranscript entries={session.transcript} />
      )}

      {/* Debug panel (development only) */}
      {process.env.NODE_ENV === "development" && (
        <DebugPanel
          sessionId={session.sessionId}
          phase={session.phase}
          connectionStatus={session.connectionStatus}
          currentSpeaker={session.currentSpeaker}
          currentOperation={session.currentOperation}
          connectionLost={session.connectionLost}
          timer={session.timerFormatted}
          transcriptCount={session.transcript.length}
        />
      )}
    </div>
  )
}
