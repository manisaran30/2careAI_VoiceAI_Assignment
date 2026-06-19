"use client"

import { formatDate, formatTime } from "@/lib/utils"

export interface AppointmentEntry {
  id: string
  date: string
  time: string
  status: "scheduled" | "completed" | "cancelled" | "rescheduled" | "no_show"
  reason?: string
  patient: { name: string; phone?: string }
  doctor: { name: string; specialty?: string }
  branch: { name: string }
}

interface AppointmentListProps {
  appointments: AppointmentEntry[]
  loading?: boolean
  emptyMessage?: string
}

const statusStyles: Record<string, string> = {
  scheduled: "bg-primary/10 text-primary",
  completed: "bg-success/10 text-success",
  cancelled: "bg-destructive/10 text-destructive",
  rescheduled: "bg-warning/10 text-warning",
  no_show: "bg-muted/10 text-muted",
}

export function AppointmentList({ appointments, loading, emptyMessage = "No appointments found" }: AppointmentListProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 bg-muted/20 animate-pulse rounded-xl" />
        ))}
      </div>
    )
  }

  if (appointments.length === 0) {
    return (
      <div className="text-center py-16 rounded-xl border border-border bg-card">
        <p className="text-4xl mb-2">📅</p>
        <p className="text-muted">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card divide-y divide-border">
      {appointments.map((apt) => (
        <div key={apt.id} className="p-4 flex items-center justify-between hover:bg-accent/50 transition-colors">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <p className="font-medium">{apt.patient?.name}</p>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium">
                {apt.status}
              </span>
            </div>
            <p className="text-sm text-muted mt-0.5">
              {apt.doctor?.name}
{apt.doctor?.specialty && " · "}
              {apt.branch?.name && " · "}
            </p>
            {apt.reason && <p className="text-xs text-muted mt-1">{apt.reason}</p>}
          </div>
          <div className="text-right text-sm shrink-0 ml-4">
            <p className="font-medium">{formatDate(apt.date)}</p>
            <p className="text-muted">{formatTime(apt.time)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
