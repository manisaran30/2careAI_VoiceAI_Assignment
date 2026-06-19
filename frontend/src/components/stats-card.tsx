"use client"

interface StatsCardProps {
  label: string
  value: string | number
  color?: "primary" | "secondary" | "success" | "destructive" | "warning" | "muted"
  icon?: string
  loading?: boolean
}

const colorMap: Record<NonNullable<StatsCardProps["color"]>, string> = {
  primary: "text-primary",
  secondary: "text-secondary",
  success: "text-success",
  destructive: "text-destructive",
  warning: "text-warning",
  muted: "text-muted",
}

export function StatsCard({ label, value, color = "primary", icon, loading }: StatsCardProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 space-y-1">
        <div className="h-4 w-24 bg-muted/20 animate-pulse rounded" />
        <div className="h-8 w-16 bg-muted/20 animate-pulse rounded mt-2" />
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-1">
      <p className="text-sm text-muted flex items-center gap-1.5">
        {icon && <span className="text-base">{icon}</span>}
        {label}
      </p>
      <p className={`text-3xl font-bold ${colorMap[color]}`}>{value}</p>
    </div>
  )
}

interface StatsGridProps {
  cards: StatsCardProps[]
}

export function StatsGrid({ cards }: StatsGridProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => (
        <StatsCard key={card.label} {...card} />
      ))}
    </div>
  )
}
