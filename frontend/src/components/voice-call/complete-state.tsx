"use client"

import Link from "next/link"

interface AppointmentDetail {
  doctor?: { name: string; specialty?: string }
  branch?: { name: string }
  date?: string
  time?: string
  status?: string
}

interface CompleteStateProps {
  outcome: string
  summary?: {
    patientName?: string
    intent?: string
    doctor?: string
    department?: string
    branch?: string
    appointmentTime?: string
    outcome?: string
    summary?: string
  }
  appointments?: AppointmentDetail[]
  onStartNew: () => void
}

const outcomeLabels: Record<string, { label: string; color: string; icon: string }> = {
  booked: { label: "Appointment Booked", color: "text-success", icon: "✅" },
  rescheduled: { label: "Appointment Rescheduled", color: "text-warning", icon: "🔄" },
  cancelled: { label: "Appointment Cancelled", color: "text-destructive", icon: "❌" },
  handoff: { label: "Human Follow-up Created", color: "text-primary", icon: "👤" },
  faq: { label: "Information Provided", color: "text-primary", icon: "ℹ️" },
  incomplete: { label: "Call Disconnected", color: "text-muted", icon: "⚠️" },
}

export function CompleteState({ outcome, summary, appointments, onStartNew }: CompleteStateProps) {
  const outcomeInfo = outcomeLabels[outcome] || { label: "Completed", color: "text-primary", icon: "✓" }

  return (
    <div className="space-y-6 py-6">
      {/* Outcome header */}
      <div className="text-center space-y-3">
        <div className="text-5xl">{outcomeInfo.icon}</div>
        <div>
          <h2 className="text-xl font-bold">Call Completed</h2>
          <p className={`text-lg font-semibold ${outcomeInfo.color}`}>{outcomeInfo.label}</p>
        </div>
      </div>

      {/* Summary card */}
      {summary && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-sm">Call Summary</h3>
          <div className="text-sm space-y-2">
            {summary.patientName && (
              <div className="flex justify-between">
                <span className="text-muted">Patient</span>
                <span className="font-medium">{summary.patientName}</span>
              </div>
            )}
            {summary.intent && (
              <div className="flex justify-between">
                <span className="text-muted">Intent</span>
                <span className="font-medium capitalize">{summary.intent.replace(/_/g, " ")}</span>
              </div>
            )}
            {summary.doctor && (
              <div className="flex justify-between">
                <span className="text-muted">Doctor</span>
                <span className="font-medium">{summary.doctor}</span>
              </div>
            )}
            {summary.department && (
              <div className="flex justify-between">
                <span className="text-muted">Department</span>
                <span className="font-medium">{summary.department}</span>
              </div>
            )}
            {summary.branch && (
              <div className="flex justify-between">
                <span className="text-muted">Branch</span>
                <span className="font-medium">{summary.branch}</span>
              </div>
            )}
            {summary.appointmentTime && (
              <div className="flex justify-between">
                <span className="text-muted">Appointment</span>
                <span className="font-medium">{summary.appointmentTime}</span>
              </div>
            )}
          </div>
          {summary.summary && (
            <p className="text-sm text-muted pt-2 border-t border-border">{summary.summary}</p>
          )}
        </div>
      )}

      {/* Appointment details */}
      {appointments && appointments.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-sm">Appointment Details</h3>
          {appointments.map((apt, i) => (
            <div key={i} className="text-sm space-y-1.5">
              {apt.doctor && <p className="font-medium">{apt.doctor.name}{apt.doctor.specialty ? ` — ${apt.doctor.specialty}` : ""}</p>}
              {apt.branch && <p className="text-muted">{apt.branch.name}</p>}
              {apt.date && apt.time && <p className="text-muted">{new Date(apt.date).toLocaleDateString("en-IN")} at {apt.time}</p>}
              {apt.status && <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary capitalize">{apt.status}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-center gap-4 pt-4">
        <button
          onClick={onStartNew}
          className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition-all"
        >
          Start New Call
        </button>
        <Link
          href="/dashboard"
          className="px-6 py-3 rounded-xl border border-border font-medium hover:bg-accent transition-colors"
        >
          View Dashboard
        </Link>
      </div>
    </div>
  )
}
