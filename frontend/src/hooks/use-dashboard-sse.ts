"use client"

import { useEffect, useRef, useCallback } from "react"

interface UseDashboardSSEOptions {
  onUpdate: (data: Record<string, unknown>) => void
  enabled?: boolean
}

export function useDashboardSSE({ onUpdate, enabled = true }: UseDashboardSSEOptions) {
  const eventSourceRef = useRef<EventSource | null>(null)
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      disconnect()
      return
    }

    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
    const url = `${apiBase}/api/events?channel=dashboard`
    const es = new EventSource(url)
    eventSourceRef.current = es

    es.addEventListener("call.completed", (event) => {
      try {
        const data = JSON.parse(event.data) as Record<string, unknown>
        onUpdateRef.current({ type: "call_completed", ...data })
      } catch {
        // ignore
      }
    })

    es.addEventListener("call.booking", (event) => {
      try {
        const data = JSON.parse(event.data) as Record<string, unknown>
        onUpdateRef.current({ type: "booking", ...data })
      } catch {
        // ignore
      }
    })

    es.onerror = () => {
      // auto-reconnects
    }

    return () => {
      disconnect()
    }
  }, [enabled, disconnect])
}
