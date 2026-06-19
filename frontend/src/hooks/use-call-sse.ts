"use client"

import { useEffect, useRef, useCallback } from "react"

export interface CallEvent {
  type: "call.connecting" | "call.active" | "call.transcript" | "call.operation" | "call.booking" | "call.completed" | "call.error" | "call.status"
  data: Record<string, unknown>
}

interface UseCallSSEOptions {
  sessionId: string | null
  onEvent: (event: CallEvent) => void
  enabled?: boolean
}

export function useCallSSE({ sessionId, onEvent, enabled = true }: UseCallSSEOptions) {
  const eventSourceRef = useRef<EventSource | null>(null)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent
  const reconnectAttempts = useRef(0)

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!sessionId || !enabled) {
      disconnect()
      return
    }

    let mounted = true

    function connect() {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
      const url = `${apiBase}/api/events?sessionId=${encodeURIComponent(sessionId!)}`
      const es = new EventSource(url)
      eventSourceRef.current = es

      es.addEventListener("connected", () => {
        reconnectAttempts.current = 0
      })

      const eventTypes = [
        "call.connecting",
        "call.active",
        "call.transcript",
        "call.operation",
        "call.booking",
        "call.completed",
        "call.error",
        "call.status",
      ]

      eventTypes.forEach((eventType) => {
        es.addEventListener(eventType, (event) => {
          try {
            const data = JSON.parse(event.data) as Record<string, unknown>
            onEventRef.current({ type: eventType as CallEvent["type"], data })
          } catch {
            // ignore malformed events
          }
        })
      })

      es.onerror = () => {
        if (!mounted) return
        reconnectAttempts.current++
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 10000)
        setTimeout(() => {
          if (mounted) connect()
        }, delay)
      }
    }

    connect()

    return () => {
      mounted = false
      disconnect()
    }
  }, [sessionId, enabled, disconnect])

  return { disconnect }
}
