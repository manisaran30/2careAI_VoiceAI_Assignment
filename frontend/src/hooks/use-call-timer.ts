"use client"

import { useState, useEffect, useRef, useCallback } from "react"

interface UseCallTimerReturn {
  elapsed: number
  formatted: string
  start: () => void
  stop: () => void
  reset: () => void
  isRunning: boolean
}

export function useCallTimer(): UseCallTimerReturn {
  const [elapsed, setElapsed] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number | null>(null)

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const start = useCallback(() => {
    clearTimer()
    startTimeRef.current = Date.now()
    setElapsed(0)
    setIsRunning(true)
    intervalRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - (startTimeRef.current ?? Date.now())) / 1000))
    }, 1000)
  }, [clearTimer])

  const stop = useCallback(() => {
    clearTimer()
    setIsRunning(false)
  }, [clearTimer])

  const reset = useCallback(() => {
    clearTimer()
    setElapsed(0)
    setIsRunning(false)
    startTimeRef.current = null
  }, [clearTimer])

  useEffect(() => {
    return clearTimer
  }, [clearTimer])

  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60
  const formatted = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`

  return { elapsed, formatted, start, stop, reset, isRunning }
}
