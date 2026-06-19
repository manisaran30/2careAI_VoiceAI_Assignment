"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { sessionStore } from "@/lib/call-session-store"

interface UseCallTimerReturn {
  elapsed: number
  formatted: string
  isRunning: boolean
}

export function useCallTimer(): UseCallTimerReturn {
  const [elapsed, setElapsed] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number | null>(null)

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  // Derive timer state from the session store
  useEffect(() => {
    const unsub = sessionStore.subscribe(() => {
      const s = sessionStore.getState()
      const timerShouldRun = s.phase === "connected" || s.phase === "ai_speaking" || s.phase === "user_speaking" || s.phase === "processing"

      if (timerShouldRun && !intervalRef.current) {
        const baseTime = s.startTime ?? Date.now()
        startTimeRef.current = baseTime
        setElapsed(Math.floor((Date.now() - baseTime) / 1000))
        clearTimer()
        intervalRef.current = setInterval(() => {
          setElapsed(Math.floor((Date.now() - (startTimeRef.current ?? Date.now())) / 1000))
        }, 1000)
      } else if (!timerShouldRun && intervalRef.current) {
        clearTimer()
        setElapsed(0)
        startTimeRef.current = null
      } else if (s.phase === "completed" || s.phase === "disconnected") {
        clearTimer()
      }
    })

    return () => {
      unsub()
      clearTimer()
    }
  }, [clearTimer])

  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60
  const formatted = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
  const isRunning = intervalRef.current !== null

  return { elapsed, formatted, isRunning }
}
