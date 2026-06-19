"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import Link from "next/link"

export default function CallHistoryPage() {
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  function loadSessions() {
    setLoading(true)
    api.voiceCall
      .list()
      .then((r) => setSessions(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadSessions()
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Call History</h1>
          <p className="text-muted text-sm mt-1">Past voice call sessions</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadSessions}
            className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-accent transition-colors"
          >
            Refresh
          </button>
          <Link
            href="/voice-call"
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            New Call
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 bg-muted/20 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-20 rounded-xl border border-border bg-card">
          <p className="text-4xl mb-3">📞</p>
          <p className="text-muted font-medium">No calls yet</p>
          <p className="text-sm text-muted mt-1">
            Start your first call with the{" "}
            <Link href="/voice-call" className="text-primary underline underline-offset-2">
              AI Receptionist
            </Link>
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => {
            const summary = session.conversationSummary
            const outcomeLabel = summary?.outcome
              ? summary.outcome.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())
              : session.status === "failed"
                ? "Failed"
                : session.status === "missed"
                  ? "Missed"
                  : "Completed"

            const outcomeColor =
              summary?.outcome === "booked" || summary?.outcome === "completed"
                ? "text-success"
                : summary?.outcome === "cancelled"
                  ? "text-destructive"
                  : summary?.outcome === "handoff"
                    ? "text-primary"
                    : session.status === "failed"
                      ? "text-destructive"
                      : "text-muted"

            return (
              <div
                key={session.id}
                className="rounded-xl border border-border bg-card p-4 hover:bg-accent/30 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <p className="font-medium">
                        {session.patient?.name || session.phone}
                      </p>
                      <span className={`text-xs font-medium capitalize px-2 py-0.5 rounded-full ${outcomeColor} bg-current/5`}>
                        {outcomeLabel}
                      </span>
                      <span className="text-xs text-muted">
                        {session._count?.appointments || 0} appointment{(session._count?.appointments || 0) !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="text-sm text-muted mt-1 space-x-4">
                      <span>{session.phone}</span>
                      {session.duration && (
                        <span>{Math.floor(session.duration / 60)}m {session.duration % 60}s</span>
                      )}
                      {session.operation && <span className="italic">{session.operation}</span>}
                    </div>
                    {summary?.summary && (
                      <p className="text-sm text-muted mt-1 line-clamp-1">{summary.summary}</p>
                    )}
                  </div>
                  <div className="text-right text-xs text-muted shrink-0 ml-4">
                    <p>{new Date(session.createdAt).toLocaleDateString("en-IN")}</p>
                    <p>{new Date(session.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-xs text-muted text-center">{sessions.length} session{sessions.length !== 1 ? "s" : ""}</p>
    </div>
  )
}
