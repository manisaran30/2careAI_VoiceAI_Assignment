"use client"

import { useState, useEffect } from "react"

interface ConnectingStateProps {
  onCancel: () => void
}

export function ConnectingState({ onCancel }: ConnectingStateProps) {
  const [showCancel, setShowCancel] = useState(false)

  useEffect(() => {
    setShowCancel(false)
    const timer = setTimeout(() => setShowCancel(true), 10000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="flex flex-col items-center justify-center py-20 space-y-6">
      {/* Pulse animation */}
      <div className="relative">
        <div className="w-20 h-20 rounded-full bg-primary/20 animate-ping absolute inset-0" />
        <div className="w-20 h-20 rounded-full bg-primary/30 flex items-center justify-center relative">
          <span className="text-2xl text-primary">📞</span>
        </div>
      </div>

      <div className="text-center space-y-2">
        <p className="text-lg font-semibold">Connecting to AI Receptionist...</p>
        <p className="text-sm text-muted">Please wait while we connect your call</p>
      </div>

      {showCancel && (
        <button
          onClick={onCancel}
          className="px-6 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
        >
          Cancel Call
        </button>
      )}
    </div>
  )
}
