"use client"

import { useState } from "react"
import { api } from "@/lib/api"

export interface Scenario {
  id: string
  name: string
  description: string
}

export interface EvaluationResult {
  id: string
  scenario: string
  passed: boolean
  executionTime: number
  outcome?: string
  createdAt: string
}

interface ScenarioRunnerProps {
  scenarios: Scenario[]
  results: EvaluationResult[]
  onRun: (scenarioId: string) => Promise<void>
  runningId: string | null
}

export function ScenarioRunner({ scenarios, results, onRun, runningId }: ScenarioRunnerProps) {
  function getLastResult(scenarioId: string) {
    return results.find((r) => r.scenario === scenarioId)
  }

  return (
    <div className="space-y-4">
      {scenarios.map((scenario) => {
        const last = getLastResult(scenario.id)
        return (
          <div key={scenario.id} className="rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-semibold">{scenario.name}</h3>
                <p className="text-sm text-muted">{scenario.description}</p>
              </div>
              <button
                onClick={() => onRun(scenario.id)}
                disabled={runningId === scenario.id}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity shrink-0 ml-4"
              >
                {runningId === scenario.id ? "Running..." : "▶ Run"}
              </button>
            </div>
            {last && (
<div className="flex items-center gap-4 text-sm p-3 rounded-lg">
                <span className="font-semibold">
                  {last.passed ? "✅ PASS" : "❌ FAIL"}
                </span>
                <span className="text-muted">{last.executionTime}ms</span>
                <span className="text-muted flex-1">{last.outcome || "—"}</span>
                <span className="text-xs text-muted">{new Date(last.createdAt).toLocaleTimeString()}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

interface EvaluationHistoryProps {
  results: EvaluationResult[]
  limit?: number
}

export function EvaluationHistory({ results, limit = 20 }: EvaluationHistoryProps) {
  const displayResults = results.slice(0, limit)

  if (displayResults.length === 0) return null

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Test History</h2>
      <div className="rounded-xl border border-border bg-card">
        <div className="p-4 space-y-2">
          {displayResults.map((r) => (
            <div key={r.id} className="flex items-center gap-4 text-sm py-2 border-b border-border last:border-0">
              <span className="w-3 h-3 rounded-full shrink-0" />
              <span className="w-40 font-medium capitalize shrink-0">{r.scenario.replace(/_/g, " ")}</span>
              <span className="text-muted shrink-0">{r.executionTime}ms</span>
              <span className="flex-1 text-muted truncate">{r.outcome || "—"}</span>
              <span className="text-xs text-muted shrink-0">{new Date(r.createdAt).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
