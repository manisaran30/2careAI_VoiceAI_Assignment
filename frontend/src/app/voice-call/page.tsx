import { VoiceCallUI } from "@/components/voice-call/voice-call-ui"
import Link from "next/link"

export const dynamic = "force-dynamic"

export default function VoiceCallPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Voice Call</h1>
          <p className="text-muted text-sm mt-1">Talk to our AI Receptionist</p>
        </div>
        <Link
          href="/voice-call/history"
          className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-accent transition-colors"
        >
          Call History
        </Link>
      </div>

      <VoiceCallUI />
    </div>
  )
}
