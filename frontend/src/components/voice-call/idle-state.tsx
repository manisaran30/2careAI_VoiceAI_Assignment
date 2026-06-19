"use client"

interface IdleStateProps {
  phone: string
  onPhoneChange: (val: string) => void
  onStartCall: () => void
  onQuickExample: (action: string) => void
}

const quickExamples = [
  { label: "Book an appointment", action: "book" },
  { label: "Reschedule an appointment", action: "reschedule" },
  { label: "Find a doctor", action: "find_doctor" },
  { label: "Hospital FAQs", action: "faq" },
]

export function IdleState({ phone, onPhoneChange, onStartCall, onQuickExample }: IdleStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-8">
      {/* Placeholder logo */}
      <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
        <span className="text-3xl text-primary font-bold">+</span>
      </div>

      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold">AI Receptionist</h2>
        <p className="text-muted text-sm">Ready to assist you.</p>
      </div>

      {/* Phone input */}
      <div className="w-full max-w-md space-y-3">
        <div className="relative">
          <input
            type="text"
            value={phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && phone.trim() && onStartCall()}
            placeholder="Enter phone number (e.g., 9876543210)"
            className="w-full px-4 py-3 rounded-xl border border-border bg-card text-center text-lg font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            autoFocus
          />
          {!phone.startsWith("+") && phone.trim() && (
            <p className="text-xs text-muted mt-1 text-center">+91 will be added automatically</p>
          )}
        </div>

        <button
          onClick={onStartCall}
          disabled={!phone.trim()}
          className="w-full py-4 rounded-xl bg-primary text-primary-foreground font-semibold text-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
        >
          Start Call
        </button>
      </div>

      {/* Quick examples */}
      <div className="w-full max-w-md">
        <p className="text-xs text-muted text-center mb-3">Try asking me to:</p>
        <div className="grid grid-cols-2 gap-2">
          {quickExamples.map((ex) => (
            <button
              key={ex.action}
              onClick={() => onQuickExample(ex.action)}
              className="px-3 py-2 rounded-lg border border-border bg-card text-sm text-muted hover:bg-accent hover:text-foreground transition-colors"
            >
              {ex.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
