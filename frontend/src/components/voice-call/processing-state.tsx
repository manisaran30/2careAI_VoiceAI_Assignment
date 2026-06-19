"use client"

interface ProcessingStateProps {
  message?: string
}

const messages = [
  "Finding doctors...",
  "Checking appointments...",
  "Updating booking...",
  "Please wait...",
]

export function ProcessingState({ message }: ProcessingStateProps) {
  const displayMessage = message || messages[Math.floor(Math.random() * messages.length)]

  return (
    <div className="flex flex-col items-center justify-center py-20 space-y-6">
      {/* Spinning gradient ring */}
      <div className="relative w-20 h-20">
        <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin" />
        <div className="absolute inset-2 rounded-full bg-primary/5 flex items-center justify-center">
          <span className="text-xl">⏳</span>
        </div>
      </div>

      <div className="text-center space-y-2">
        <p className="text-lg font-semibold">{displayMessage}</p>
        <p className="text-sm text-muted">This should only take a moment</p>
      </div>
    </div>
  )
}
