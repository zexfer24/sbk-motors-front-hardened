'use client'

import { TrendingUp, TrendingDown } from 'lucide-react'
import type { DashboardKpi } from '@/lib/hooks/use-dashboard'
import { cn } from '@/lib/utils'

interface KpiCardsProps {
  kpis: DashboardKpi[]
}

export function KpiCards({ kpis }: KpiCardsProps) {
  return (
    <section aria-label="Indicadores del día">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        {kpis.map((kpi, i) => {
          const isHero = kpi.id === 'revenue'
          const up = kpi.trend >= 0
          const TrendIcon = up ? TrendingUp : TrendingDown
          return (
            <article
              key={kpi.id}
              className={cn(
                'count-in relative flex flex-col justify-between overflow-hidden rounded-lg border p-4',
                'shadow-[0_2px_0_0_oklch(0_0_0/0.4)] transition-all duration-200',
                'hover:-translate-y-1 hover:shadow-[0_8px_24px_-8px_oklch(0_0_0/0.5)]',
                isHero
                  ? 'sheen border-primary/50 bg-primary/10 col-span-2 hover:border-primary/70 hover:shadow-[0_0_0_1px_oklch(0.58_0.22_25/0.4),0_8px_24px_-8px_oklch(0.58_0.22_25/0.5)] lg:col-span-1'
                  : 'border-border bg-card hover:border-primary/40',
              )}
              style={{ animationDelay: `${i * 70}ms` }}
            >
              {isHero && (
                <span className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/20 blur-2xl" />
              )}
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p
                className={cn(
                  'mt-2 font-mono font-bold tabular-nums leading-none',
                  isHero
                    ? 'text-3xl text-primary sm:text-4xl'
                    : 'text-2xl text-foreground sm:text-3xl',
                )}
              >
                {kpi.value}
              </p>
              <div className="mt-3 flex items-center gap-1.5">
                {kpi.available && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.7rem] font-semibold',
                      up
                        ? 'bg-success/15 text-success'
                        : 'bg-warning/15 text-warning',
                    )}
                  >
                    <TrendIcon className="h-3 w-3" />
                    {Math.abs(kpi.trend)}%
                  </span>
                )}
                <span className="truncate text-[0.7rem] text-muted-foreground">
                  {kpi.hint}
                </span>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
