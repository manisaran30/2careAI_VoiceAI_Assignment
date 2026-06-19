"use client"

interface ActiveStateProps {
  operation: string | null
  isAiSpeaking: boolean
  isUserSpeaking: boolean
  timer: string
  onEndCall: () => void
}

function Waveform() {
  return (
    <div className="flex items-center gap-0.5 h-8">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="w-1 bg-primary rounded-full animate-pulse"
          style={{
            height: `${40 + Math.sin(i * 1.5) * 30}%`,
            animationDelay: `${i * 0.15}s`,
            animationDuration: "0.8s",
          }}
        />
      ))}
    </div>
  )
}

function SpeakingIndicator({ label, isActive, color }: { label: string; isActive: boolean; color: string }) {
  return (
    <div className={`flex items-center gap-2 text-sm ${isActive ? "opacity-100" : "opacity-40"}`}>
      <span className={`w-2 h-2 rounded-full ${color} ${isActive ? "animate-pulse" : ""}`} />
      <span>{label}</span>
    </div>
  )
}

export function ActiveState({ operation, isAiSpeaking, isUserSpeaking, timer, onEndCall }: ActiveStateProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Waveform />
          <div>
            <p className="text-2xl font-mono font-bold tabular-nums">{timer}</p>
            <p className="text-xs text-muted">Call duration</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <SpeakingIndicator label="AI" isActive={isAiSpeaking} color="bg-primary" />
          <SpeakingIndicator label="You" isActive={isUserSpeaking} color="bg-success" />
        </div>
      </div>

      {operation && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium text-primary">{operation}</p>
          </div>
        </div>
      )}

      <div className="flex justify-center pt-8">
        <button
          onClick={onEndCall}
          className="px-8 py-3 rounded-xl bg-destructive text-destructive-foreground font-semibold hover:opacity-90 transition-all active:scale-[0.98] flex items-center gap-2"
        >
          <span className="w-2 h-2 rounded-full bg-destructive-foreground animate-pulse" />
          End Call
        </button>
      </div>
    </div>
  )
}
