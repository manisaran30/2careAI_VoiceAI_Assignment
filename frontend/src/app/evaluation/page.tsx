"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"

export default function EvaluationPage() {
  const [scenarios, setScenarios] = useState<any[]>([])
  const [results, setResults] = useState<any[]>([])
  const [running, setRunning] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  function loadData() {
    setLoading(true)
    Promise.all([api.evaluations.scenarios(), api.evaluations.results()])
      .then(([s, r]) => {
        setScenarios(s.data)
        setResults(r.data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [])

  async function runScenario(scenarioId: string) {
    setRunning(scenarioId)
    try {
      await api.evaluations.run(scenarioId)
      const r = await api.evaluations.results()
      setResults(r.data)
    } catch {}
    setRunning(null)
  }

  function getLastResult(scenarioId: string) {
    return results.find((r) => r.scenario === scenarioId)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Evaluation Harness</h1>
          <p className="text-muted mt-1">Test and verify each scenario end-to-end</p>
        </div>
        <button onClick={loadData} className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-accent">
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3,4,5,6].map((i) => <div key={i} className="h-20 bg-muted/20 animate-pulse rounded-xl" />)}
        </div>
      ) : (
        <div className="grid gap-4">
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
                    onClick={() => runScenario(scenario.id)}
                    disabled={running === scenario.id}
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity shrink-0 ml-4"
                  >
                    {running === scenario.id ? "Running..." : "▶ Run"}
                  </button>
                </div>
                {last && (
                  <div className={`flex items-center gap-4 text-sm p-3 rounded-lg ${
                    last.passed ? "bg-success/5" : "bg-destructive/5"
                  }`}>
                    <span className={`font-semibold ${last.passed ? "text-success" : "text-destructive"}`}>
                      {last.passed ? "✅ PASS" : "❌ FAIL"}
                    </span>
                    <span className="text-muted">{last.executionTime}ms</span>
                    <span className="text-muted flex-1">{last.outcome}</span>
                    <span className="text-xs text-muted">{new Date(last.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* History */}
      {results.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Test History</h2>
          <div className="rounded-xl border border-border bg-card">
            <div className="p-4 space-y-2">
              {results.slice(0, 10).map((r) => (
                <div key={r.id} className="flex items-center gap-4 text-sm py-2 border-b border-border last:border-0">
                  <span className={`font-medium w-3 h-3 rounded-full ${r.passed ? "bg-success" : "bg-destructive"}`} />
                  <span className="w-40 font-medium capitalize">{r.scenario.replace(/_/g, " ")}</span>
                  <span className="text-muted">{r.executionTime}ms</span>
                  <span className="flex-1 text-muted truncate">{r.outcome || "—"}</span>
                  <span className="text-xs text-muted">{new Date(r.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
