"use client"

import { formatDate } from "@/lib/utils"

export interface CallLogEntry {
  id: string
  phone: string
  direction: "inbound" | "outbound"
  status: "completed" | "missed" | "failed"
  duration?: number
  intent?: string
  summary?: string
  patient?: { name: string }
  createdAt: string
}

interface RecentCallsTableProps {
  calls: CallLogEntry[]
  limit?: number
  loading?: boolean
}

export function RecentCallsTable({ calls, limit = 10, loading }: RecentCallsTableProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card">
        <div className="p-4 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 bg-muted/20 animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  const displayCalls = calls.slice(0, limit)

  if (displayCalls.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-3xl mb-2">📞</p>
        <p className="text-muted text-sm">No calls yet</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-accent/50">
            <th className="text-left p-3 font-semibold text-muted-foreground">Patient</th>
            <th className="text-left p-3 font-semibold text-muted-foreground">Phone</th>
            <th className="text-left p-3 font-semibold text-muted-foreground">Intent</th>
            <th className="text-left p-3 font-semibold text-muted-foreground">Status</th>
            <th className="text-left p-3 font-semibold text-muted-foreground">Duration</th>
            <th className="text-left p-3 font-semibold text-muted-foreground">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {displayCalls.map((call) => (
            <tr key={call.id} className="hover:bg-accent/30 transition-colors">
              <td className="p-3 font-medium">{call.patient?.name || "—"}</td>
              <td className="p-3 text-muted font-mono text-xs">{call.phone}</td>
              <td className="p-3 text-muted capitalize">
                {call.intent ? call.intent.replace(/_/g, " ") : "—"}
              </td>
              <td className="p-3">
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium">
                  {call.status}
                </span>
              </td>
              <td className="p-3 text-muted">
                {call.duration ? `${Math.floor(call.duration / 60)}m ${call.duration % 60}s` : "—"}
              </td>
              <td className="p-3 text-muted text-xs">{formatDate(call.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
