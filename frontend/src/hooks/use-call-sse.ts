"use client"

import { useEffect, useRef } from "react"
import { sessionStore, SESSION_EVENT_TYPES, type CallEvent } from "@/lib/call-session-store"

interface UseCallSSEOptions {
  sessionId: string | null
  enabled?: boolean
}

export function useCallSSE({ sessionId, enabled = true }: UseCallSSEOptions) {
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectAttempts = useRef(0)
  const enabledRef = useRef(enabled)
  const sessionIdRef = useRef(sessionId)
  enabledRef.current = enabled
  sessionIdRef.current = sessionId

  const disconnect = useRef(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    reconnectAttempts.current = 0
  }).current

  useEffect(() => {
    if (!sessionId || !enabled) {
      disconnect()
      return
    }

    let mounted = true
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null

    function connect() {
      if (!mounted) return
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
      const url = `${apiBase}/api/events?sessionId=${encodeURIComponent(sessionId!)}`
      const es = new EventSource(url)
      eventSourceRef.current = es

      es.addEventListener("connected", (event) => {
        reconnectAttempts.current = 0
        try {
          const data = JSON.parse(event.data) as Record<string, unknown>
          if (data.sessionState && typeof data.sessionState === "object") {
            sessionStore.actions.restoreFromEvent(data.sessionState as Record<string, unknown>)
          }
        } catch {
          // ignore
        }
      })

      function handleEvent(eventType: CallEvent["type"]) {
        es.addEventListener(eventType, (event) => {
          try {
            const data = JSON.parse(event.data) as Record<string, unknown>
            const activePhases = ["connecting", "connected", "ai_speaking", "user_speaking", "processing", "ending"]
            const currentPhase = sessionStore.getState().phase
            if (!activePhases.includes(currentPhase) && eventType !== "call.disconnected") {
              return
            }

            switch (eventType) {
              case "call.connected":
                sessionStore.actions.setConnected(data.sessionId as string)
                if (data.connectionStatus) {
                  sessionStore.actions.restoreFromEvent(data as Record<string, unknown>)
                }
                break
              case "call.connecting":
                break
              case "call.transcript":
                sessionStore.actions.appendTranscript({
                  speaker: String(data.speaker || "unknown"),
                  text: String(data.text || ""),
                  isFinal: Boolean(data.isFinal),
                })
                break
              case "call.speaker":
                if (data.speaker === "ai") {
                  sessionStore.actions.setAiSpeaking()
                } else if (data.speaker === "user") {
                  sessionStore.actions.setUserSpeaking()
                }
                break
              case "call.operation":
                sessionStore.actions.setOperation(String(data.operation || ""))
                if (currentPhase !== "processing") {
                  sessionStore.actions.setProcessing(String(data.operation || ""))
                }
                break
              case "call.booking":
                if (data.appointment) {
                  sessionStore.actions.addAppointment(data.appointment as any)
                }
                break
              case "call.ending":
                sessionStore.actions.startEnding()
                break
              case "call.completed":
                sessionStore.actions.setCompleted({
                  summary: (data.summary as Record<string, unknown>) || undefined,
                  outcome: ((data.summary as Record<string, unknown>)?.outcome as string) || "completed",
                  terminationReason: (data.terminationReason as string) || "agent_ended",
                })
                break
              case "call.disconnected":
                sessionStore.actions.setDisconnected(
                  String(data.message || "Call was disconnected unexpectedly"),
                  (data.terminationReason as string) || "disconnected",
                )
                break
              case "call.error":
                sessionStore.actions.setDisconnected(
                  String(data.message || sessionStore.getState().errorMessage),
                  "error",
                )
                break
              case "call.status":
                sessionStore.actions.restoreFromEvent(data)
                break
              case "call.state":
                if (data.state === "ai_speaking") {
                  sessionStore.actions.setAiSpeaking()
                } else if (data.state === "user_speaking") {
                  sessionStore.actions.setUserSpeaking()
                } else if (data.state === "processing") {
                  sessionStore.actions.setProcessing(String(data.operation || "Processing..."))
                } else if (data.state === "connected") {
                  sessionStore.actions.setConnected(data.sessionId as string)
                }
                break
            }
          } catch {
            // ignore malformed events
          }
        })
      }

      SESSION_EVENT_TYPES.forEach((t) => handleEvent(t as CallEvent["type"]))

      es.onerror = () => {
        if (!mounted) return
        sessionStore.actions.setConnectionLost(true)
        es.close()
        reconnectAttempts.current++
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 10000)
        reconnectTimeout = setTimeout(() => {
          if (mounted) connect()
        }, delay)
      }
    }

    connect()

    return () => {
      mounted = false
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      disconnect()
    }
  }, [sessionId, enabled, disconnect])

  return { disconnect }
}
