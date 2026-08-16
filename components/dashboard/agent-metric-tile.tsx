import { TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

// Extraído de components/views/advisor-control-view.tsx (se llamaba
// `Metric` ahí) para reusarlo también en components/views/operations-center-view.tsx
// — misma tarjeta de métrica, mismo criterio de flecha buena/mala.
export function MetricTile({
  icon: Icon,
  label,
  value,
  trend,
  invert = false,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  trend: number | null
  /** true = menos es mejor (velocidad, tiempo muerto) — invierte qué flecha se pinta como logro. */
  invert?: boolean
}) {
  const isGood = trend !== null && (invert ? trend <= 0 : trend >= 0)
  const TrendIcon = trend !== null && trend >= 0 ? TrendingUp : TrendingDown
  return (
    <div className="flex flex-col gap-1 bg-card px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3 w-3" />
        <span className="text-[0.65rem]">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-base font-bold tabular-nums text-foreground">{value}</span>
        {trend !== null && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-[0.65rem] font-semibold',
              isGood ? 'text-success' : 'text-warning',
            )}
          >
            <TrendIcon className="h-2.5 w-2.5" />
            {Math.abs(trend)}%
          </span>
        )}
      </div>
    </div>
  )
}
