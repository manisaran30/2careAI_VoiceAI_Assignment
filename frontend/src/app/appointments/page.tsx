"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { formatDate, formatTime } from "@/lib/utils"

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchPhone, setSearchPhone] = useState("")
  const [statusFilter, setStatusFilter] = useState("")

  function loadAppointments() {
    setLoading(true)
    api.appointments.list({ phone: searchPhone || undefined, status: statusFilter || undefined })
      .then((r) => setAppointments(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadAppointments() }, [statusFilter])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Appointments</h1>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search by phone..."
            value={searchPhone}
            onChange={(e) => setSearchPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadAppointments()}
            className="px-3 py-2 rounded-lg border border-border bg-card text-sm w-56"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border bg-card text-sm"
          >
            <option value="">All statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="rescheduled">Rescheduled</option>
            <option value="no_show">No Show</option>
          </select>
          <button onClick={loadAppointments} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">Search</button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4,5].map((i) => <div key={i} className="h-16 bg-muted/20 animate-pulse rounded-xl" />)}
        </div>
      ) : appointments.length === 0 ? (
        <div className="text-center py-16 text-muted">
          <p className="text-4xl mb-2">📅</p>
          <p>No appointments found</p>
          <p className="text-sm mt-1">Try a different phone number or filter</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {appointments.map((apt) => (
            <div key={apt.id} className="p-4 flex items-center justify-between hover:bg-accent/50 transition-colors">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <p className="font-medium">{apt.patient?.name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    apt.status === "scheduled" ? "bg-primary/10 text-primary" :
                    apt.status === "completed" ? "bg-success/10 text-success" :
                    apt.status === "cancelled" ? "bg-destructive/10 text-destructive" :
                    apt.status === "rescheduled" ? "bg-warning/10 text-warning" :
                    "bg-muted/10 text-muted"
                  }`}>{apt.status}</span>
                </div>
                <p className="text-sm text-muted mt-0.5">
                  {apt.doctor?.name} · {apt.doctor?.specialty} · {apt.branch?.name}
                </p>
                {apt.reason && <p className="text-xs text-muted mt-1">{apt.reason}</p>}
              </div>
              <div className="text-right text-sm">
                <p className="font-medium">{formatDate(apt.date)}</p>
                <p className="text-muted">{formatTime(apt.time)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted text-center">{appointments.length} appointment{appointments.length !== 1 ? "s" : ""}</p>
    </div>
  )
}
