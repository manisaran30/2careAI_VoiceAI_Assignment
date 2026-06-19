"use client"

import type { CallPhase } from "@/lib/call-session-store"

interface DebugPanelProps {
  sessionId: string | null
  phase: CallPhase
  connectionStatus: string
  currentSpeaker: string | null
  currentOperation: string | null
  connectionLost: boolean
  timer: string
  transcriptCount: number
}

export function DebugPanel({
  sessionId,
  phase,
  connectionStatus,
  currentSpeaker,
  currentOperation,
  connectionLost,
  timer,
  transcriptCount,
}: DebugPanelProps) {
  return (
    <details className="rounded-xl border border-border bg-card p-3 text-xs font-mono">
      <summary className="cursor-pointer font-semibold text-sm text-muted">Debug Panel</summary>
      <div className="mt-3 space-y-1">
        <Row label="Session ID" value={sessionId || "—"} />
        <Row label="State" value={phase} />
        <Row label="Connection" value={connectionStatus} />
        <Row label="Speaker" value={currentSpeaker || "—"} />
        <Row label="Operation" value={currentOperation || "—"} />
        <Row label="Timer" value={timer} />
        <Row label="Transcripts" value={String(transcriptCount)} />
        <Row label="Connection Lost" value={connectionLost ? "true" : "false"} />
      </div>
    </details>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
