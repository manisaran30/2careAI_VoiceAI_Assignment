import Link from "next/link"

export default function Home() {
  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="text-center py-16 space-y-6">
        <h1 className="text-5xl font-bold tracking-tight">
          AI Receptionist for{" "}
          <span className="text-primary">Apollo Hospitals</span>
        </h1>
        <p className="text-xl text-muted max-w-2xl mx-auto leading-relaxed">
          Powered by Bolna Voice AI — book appointments, get doctor information,
          and manage your healthcare needs through natural conversation.
        </p>
        <div className="flex justify-center gap-4 pt-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center px-6 py-3 rounded-lg border border-border bg-card font-medium hover:bg-accent transition-colors"
          >
            View Dashboard
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="grid md:grid-cols-3 gap-6">
        {features.map((f) => (
          <div key={f.title} className="rounded-xl border border-border bg-card p-6 space-y-3">
            <div className="text-2xl">{f.icon}</div>
            <h3 className="font-semibold text-lg">{f.title}</h3>
            <p className="text-muted text-sm leading-relaxed">{f.description}</p>
          </div>
        ))}
      </section>

      {/* Stats */}
      <section className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-muted text-sm">Built for</p>
        <p className="text-2xl font-bold mt-1">Apollo Hospitals, Chennai</p>
        <p className="text-muted text-sm mt-2">
          4 branches · 10 departments · 21 doctors · 24x7 AI receptionist
        </p>
      </section>
    </div>
  )
}

const features = [
  {
    icon: "📅",
    title: "Book Appointments",
    description:
      "Speak naturally to book, reschedule, or cancel appointments with any doctor across Apollo Chennai branches.",
  },
  {
    icon: "👨‍⚕️",
    title: "Doctor Lookup",
    description:
      "Ask about doctors by specialty, check availability, and get recommendations for the right specialist.",
  },
  {
    icon: "🏥",
    title: "Hospital Information",
    description:
      "Get answers about OPD timings, branch locations, consultation fees, emergency services, and more.",
  },
]
