"use client"

import { useRef, useEffect } from "react"

export interface LogEntry {
  type: "transcript" | "intent" | "function" | "result"
  message: string
  detail?: string
  timestamp: string
}

interface LiveTranscriptProps {
  logs: LogEntry[]
  isActive?: boolean
  showSummary?: boolean
  scenario?: string
  apiCalls?: number
  messagesCount?: number
}

export function LiveTranscript({ logs, isActive = false, showSummary = false, scenario, apiCalls = 0, messagesCount = 0 }: LiveTranscriptProps) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [logs])

  if (logs.length === 0) {
    return (
      <div className="text-center py-16 rounded-xl border border-border bg-card">
        <p className="text-4xl mb-3">🎙️</p>
        <p className="text-muted">Select a scenario and click Start Conversation</p>
        <p className="text-xs text-muted mt-1">Watch the AI handle the call in real-time</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card">
        <div className="p-4 border-b border-border font-semibold text-sm flex items-center gap-2">
          {isActive && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
          <span>Live Transcript</span>
          {isActive && <span className="text-xs text-muted font-normal animate-pulse">● Recording</span>}
        </div>
        <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
          {logs.map((log, i) => (
            <div key={i} className="flex gap-3">
              <span className="text-xs text-muted w-12 shrink-0 pt-0.5">{log.timestamp}</span>
              <div className="flex-1 text-sm">
                {log.message}
                {log.detail && log.type !== "transcript" && (
                  <pre className="text-xs text-muted mt-1 bg-muted/10 p-2 rounded overflow-x-auto">{log.detail}</pre>
                )}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </div>

      {showSummary && !isActive && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <h3 className="font-semibold text-sm">Conversation Summary</h3>
          <div className="text-sm text-muted space-y-1">
            {scenario && (
              <p>Scenario: <span className="font-medium text-foreground">{scenario.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span></p>
            )}
            <p>Messages: <span className="font-medium text-foreground">{messagesCount}</span></p>
            <p>API Calls: <span className="font-medium text-foreground">{apiCalls}</span></p>
          </div>
        </div>
      )}
    </div>
  )
}

interface TranscriptControlsProps {
  isRunning: boolean
  onStart: () => void
  onReset: () => void
  children?: React.ReactNode
}

export function TranscriptControls({ isRunning, onStart, onReset, children }: TranscriptControlsProps) {
  return (
    <div className="flex items-center gap-4 flex-wrap">
      {children}
      <button
        onClick={onStart}
        disabled={isRunning}
        className="px-6 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {isRunning ? "Running..." : "▶ Start Conversation"}
      </button>
      {isRunning && (
        <button onClick={onReset} className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-accent">
          Reset
        </button>
      )}
    </div>
  )
}
