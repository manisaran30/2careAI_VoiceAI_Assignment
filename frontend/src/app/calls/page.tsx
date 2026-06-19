"use client"

import { useState } from "react"
import { api } from "@/lib/api"

export default function CallsPage() {
  const [phone, setPhone] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ message: string; status: string; execution_id: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function initiateCall(e: React.FormEvent) {
    e.preventDefault()
    if (!phone) return

    let formattedPhone = phone.trim()
    if (!formattedPhone.startsWith("+")) {
      formattedPhone = "+91" + formattedPhone
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await api.calls.initiate(formattedPhone)
      setResult(response.data)
    } catch (err: any) {
      setError(err.message || "Failed to initiate call")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Initiate Call</h1>
        <p className="text-muted text-sm mt-1">Start a voice call to a patient via Bolna AI</p>
      </div>

      <form onSubmit={initiateCall} className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1.5">Phone Number</label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="9876543210 or +919876543210"
            className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm"
          />
          <p className="text-xs text-muted mt-1">E.164 format supported. +91 prefix added automatically if missing.</p>
        </div>
        <button
          type="submit"
          disabled={loading || !phone}
          className="px-6 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Calling..." : "Initiate Call"}
        </button>
      </form>

      {error && (
        <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="p-4 rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-primary">✓</span>
            <span className="font-medium">Call initiated</span>
          </div>
          <div className="mt-3 space-y-1 text-sm text-muted">
            <p><span className="font-medium text-foreground">Status:</span> {result.status}</p>
            <p><span className="font-medium text-foreground">Execution ID:</span> {result.execution_id}</p>
            <p><span className="font-medium text-foreground">Message:</span> {result.message}</p>
          </div>
        </div>
      )}

      <div className="p-4 rounded-xl border border-border bg-muted/20">
        <h3 className="font-medium text-sm mb-2">Bolna Webhook Setup</h3>
        <p className="text-xs text-muted">
          Configure your Bolna agent webhook URL to receive call events:
        </p>
        <div className="mt-2 space-y-1 text-xs font-mono">
          <p className="text-muted">POST /api/webhooks/bolna/call-started</p>
          <p className="text-muted">POST /api/webhooks/bolna/call-completed</p>
          <p className="text-muted">POST /api/webhooks/bolna/booking</p>
        </div>
        <p className="text-xs text-muted mt-2">
          For local development, use ngrok to expose your localhost to the internet.
        </p>
      </div>
    </div>
  )
}
