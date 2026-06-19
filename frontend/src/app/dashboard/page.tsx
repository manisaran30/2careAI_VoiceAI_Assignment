"use client"

import { useEffect, useState, useCallback } from "react"
import { api } from "@/lib/api"
import { formatDate, formatTime } from "@/lib/utils"
import { useDashboardSSE } from "@/hooks/use-dashboard-sse"

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null)
  const [recent, setRecent] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(() => {
    Promise.all([api.dashboard.stats(), api.dashboard.recent()])
      .then(([s, r]) => {
        setStats(s.data)
        setRecent(r.data)
        setError(null)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const interval = setInterval(loadData, 15000)
    return () => clearInterval(interval)
  }, [loadData])

  // SSE for real-time updates
  const [updateCount, setUpdateCount] = useState(0)
  useDashboardSSE({
    onUpdate: () => {
      setUpdateCount((c) => c + 1)
      loadData()
    },
  })

  if (loading) return <div className="space-y-4"><div className="h-8 w-48 bg-muted/20 animate-pulse rounded" /><div className="grid grid-cols-2 md:grid-cols-4 gap-4"><div className="h-24 bg-muted/20 animate-pulse rounded-xl" /><div className="h-24 bg-muted/20 animate-pulse rounded-xl" /><div className="h-24 bg-muted/20 animate-pulse rounded-xl" /><div className="h-24 bg-muted/20 animate-pulse rounded-xl" /></div></div>
  if (error) return <div className="text-center py-12 text-destructive">Failed to load dashboard: {error}</div>
  if (!stats) return <div className="text-center py-12 text-muted">No data available</div>

  const cards = [
    { label: "Today's Calls", value: stats.todayCalls, color: "text-primary" as const },
    { label: "Total Patients", value: stats.totalPatients, color: "text-secondary" as const },
    { label: "Active Doctors", value: stats.totalDoctors, color: "text-success" as const },
    { label: "Missed Calls", value: stats.missedCalls, color: "text-destructive" as const },
    { label: "Appointments Today", value: stats.todayAppointments, color: "text-primary" as const },
    { label: "Pending Follow-ups", value: stats.pendingFollowups, color: "text-warning" as const },
    { label: "AI Booked Today", value: stats.todayBooked, color: "text-success" as const },
    { label: "Cancelled Today", value: stats.todayCancelled, color: "text-muted" as const },
  ]

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-2">
          {updateCount > 0 && (
            <span className="text-xs text-muted animate-pulse">● Live</span>
          )}
          <button
            onClick={loadData}
            className="px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-accent transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-border bg-card p-4 space-y-1">
            <p className="text-sm text-muted">{card.label}</p>
            <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Recent Calls */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Recent Calls</h2>
        {recent?.recentCalls?.length > 0 ? (
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {recent.recentCalls.slice(0, 5).map((call: any) => (
              <div key={call.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{call.patient?.name || call.phone}</p>
                  <p className="text-sm text-muted">{call.intent || call.summary?.slice(0, 60) || call.operation || "No summary"}</p>
                </div>
                <div className="text-right text-sm">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                    call.status === "completed" ? "bg-success/10 text-success" :
                    call.status === "missed" ? "bg-destructive/10 text-destructive" :
                    call.status === "failed" ? "bg-destructive/10 text-destructive" :
                    call.status === "active" ? "bg-primary/10 text-primary" :
                    "bg-muted/10 text-muted"
                  }`}>{call.status}</span>
                  <p className="text-muted mt-1">{formatDate(call.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-3xl mb-2">📞</p>
            <p className="text-muted text-sm">No recent calls</p>
            <p className="text-xs text-muted mt-1">Calls will appear here once you start using the AI Receptionist</p>
          </div>
        )}
      </section>

      {/* Recent Appointments */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Recent Appointments</h2>
        {recent?.recentAppointments?.length > 0 ? (
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {recent.recentAppointments.slice(0, 5).map((apt: any) => (
              <div key={apt.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{apt.patient?.name}</p>
                  <p className="text-sm text-muted">{apt.doctor?.name} — {apt.reason || "No reason"}</p>
                </div>
                <div className="text-right text-sm">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                    apt.status === "scheduled" ? "bg-primary/10 text-primary" :
                    apt.status === "completed" ? "bg-success/10 text-success" :
                    apt.status === "cancelled" ? "bg-destructive/10 text-destructive" :
                    "bg-muted/10 text-muted"
                  }`}>{apt.status}</span>
                  <p className="text-muted mt-1">{formatDate(apt.date)} at {formatTime(apt.time)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-3xl mb-2">📅</p>
            <p className="text-muted text-sm">No recent appointments</p>
          </div>
        )}
      </section>

      {/* Pending Follow-ups */}
      {recent?.pendingFollowups?.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-warning">Pending Follow-ups</h2>
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {recent.pendingFollowups.map((f: any) => (
              <div key={f.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{f.patient?.name || f.patientId}</p>
                  <p className="text-sm text-muted">{f.reason}</p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning font-medium">{f.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Live indicator */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted">
        <span className={`w-1.5 h-1.5 rounded-full ${updateCount > 0 ? "bg-success animate-pulse" : "bg-muted"}`} />
        <span>{updateCount > 0 ? "Updating live" : "Auto-refreshes every 15s"}</span>
      </div>
    </div>
  )
}
