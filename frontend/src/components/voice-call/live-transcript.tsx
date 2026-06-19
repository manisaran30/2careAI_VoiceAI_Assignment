"use client"

import { useRef, useEffect } from "react"
import type { TranscriptEntry } from "@/lib/call-session-store"

interface LiveTranscriptProps {
  entries: TranscriptEntry[]
}

export function LiveTranscript({ entries }: LiveTranscriptProps) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [entries])

  if (entries.length === 0) return null

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="p-3 border-b border-border font-semibold text-sm flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span>Live Transcript</span>
      </div>
      <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
        {entries.map((entry, i) => (
          <div key={i} className="flex gap-2 text-sm">
            <span className={`font-semibold shrink-0 ${entry.speaker === "ai" ? "text-primary" : "text-foreground"}`}>
              {entry.speaker === "ai" ? "AI:" : "You:"}
            </span>
            <span className="text-muted">{entry.text}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  )
}
