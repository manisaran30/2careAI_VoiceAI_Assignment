"use client"

import { useState } from "react"

interface ErrorStateProps {
  message: string
  onRetry: () => void
  onRequestCallback: (reason: string) => Promise<void>
}

export function ErrorState({ message, onRetry, onRequestCallback }: ErrorStateProps) {
  const [showCallbackForm, setShowCallbackForm] = useState(false)
  const [callbackReason, setCallbackReason] = useState("")
  const [callbackLoading, setCallbackLoading] = useState(false)

  async function handleCallbackSubmit() {
    if (!callbackReason.trim()) return
    setCallbackLoading(true)
    try {
      await onRequestCallback(callbackReason)
      setShowCallbackForm(false)
    } finally {
      setCallbackLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-6">
      <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center">
        <span className="text-3xl">⚠️</span>
      </div>

      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold">Call Could Not Be Connected</h2>
        <p className="text-muted text-sm max-w-sm">{message}</p>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onRetry}
          className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition-all"
        >
          Try Again
        </button>
        <button
          onClick={() => setShowCallbackForm(!showCallbackForm)}
          className="px-6 py-3 rounded-xl border border-border font-medium hover:bg-accent transition-colors"
        >
          Request a Callback
        </button>
      </div>

      {/* Callback form */}
      {showCallbackForm && (
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 space-y-3">
          <h3 className="font-semibold text-sm">Request a Callback</h3>
          <p className="text-xs text-muted">A staff member will call you back shortly.</p>
          <textarea
            value={callbackReason}
            onChange={(e) => setCallbackReason(e.target.value)}
            placeholder="What do you need help with?"
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            onClick={handleCallbackSubmit}
            disabled={!callbackReason.trim() || callbackLoading}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 disabled:opacity-40 transition-all"
          >
            {callbackLoading ? "Submitting..." : "Request Callback"}
          </button>
        </div>
      )}
    </div>
  )
}
