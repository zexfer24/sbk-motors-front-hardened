'use client'

import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BarChartPanelProps {
  title: string
  icon: LucideIcon
  labels: string[]
  data: number[]
  /** oklch hue used for the bar accent */
  hue: number
  format: (value: number) => string
  /** stagger base delay so panels assemble one after another */
  baseDelay?: number
  /** show a placeholder message instead of bars (e.g. source not connected yet) */
  unavailable?: boolean
  unavailableMessage?: string
}

export function BarChartPanel({
  title,
  icon: Icon,
  labels,
  data,
  hue,
  format,
  baseDelay = 0,
  unavailable = false,
  unavailableMessage = 'Sin datos disponibles.',
}: BarChartPanelProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const max = Math.max(...data, 1)
  const total = data.reduce((sum, v) => sum + v, 0)
  const peakIndex = data.indexOf(max)

  return (
    <section className="flex flex-col rounded-lg border border-border bg-card p-4 sm:p-5">
      <div className="mb-1 flex items-center gap-2">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border"
          style={{
            background: `oklch(0.58 0.22 ${hue} / 0.14)`,
            color: `oklch(0.72 0.2 ${hue})`,
          }}
        >
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="font-mono text-xs text-muted-foreground">
            {unavailable ? 'Sin conectar' : `Total · ${format(total)}`}
          </p>
        </div>
      </div>

      {unavailable ? (
        <div className="mt-5 flex h-44 flex-col items-center justify-center gap-1 text-center">
          <p className="text-xs text-muted-foreground">{unavailableMessage}</p>
        </div>
      ) : (
      <div className="relative mt-5 flex h-44 items-stretch gap-1 sm:gap-1.5">
        {data.map((value, i) => {
          const heightPct = Math.max((value / max) * 100, 3)
          const isHovered = hovered === i
          const isPeak = i === peakIndex
          return (
            <div
              key={labels[i]}
              className="group/bar relative flex h-full flex-1 flex-col items-center justify-end"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered(null)}
              tabIndex={0}
              role="img"
              aria-label={`${labels[i]}: ${format(value)}`}
            >
              {isHovered && (
                <div className="animate-blur-in pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-primary/40 bg-popover px-2 py-1 text-center shadow-[0_4px_16px_-4px_oklch(0_0_0/0.6)]">
                  <p className="font-mono text-xs font-bold text-foreground">
                    {format(value)}
                  </p>
                  <p className="text-[0.65rem] text-muted-foreground">
                    {labels[i]}
                  </p>
                </div>
              )}
              <div
                className="bar-rise w-full rounded-t-sm transition-[box-shadow,filter] duration-200"
                style={{
                  height: `${heightPct}%`,
                  animationDelay: `${baseDelay + i * 55}ms`,
                  background: isHovered
                    ? `oklch(0.66 0.24 ${hue})`
                    : `linear-gradient(to top, oklch(0.5 0.2 ${hue}), oklch(0.6 0.22 ${hue}))`,
                  boxShadow: isHovered
                    ? `0 0 14px 1px oklch(0.6 0.22 ${hue} / 0.7)`
                    : isPeak
                      ? `0 0 8px 0 oklch(0.6 0.22 ${hue} / 0.4)`
                      : 'none',
                }}
              />
              <span
                className={cn(
                  'mt-2 font-mono text-[0.6rem] transition-colors',
                  isHovered ? 'text-foreground' : 'text-muted-foreground',
                  // Con 24 barras el eje se amontona en pantallas chicas —
                  // se muestra una de cada dos ahí (el tooltip al pasar el
                  // mouse/tocar siempre trae la hora exacta igual).
                  i % 2 !== 0 && 'hidden sm:inline',
                )}
              >
                {labels[i].replace('h', '')}
              </span>
            </div>
          )
        })}
      </div>
      )}
    </section>
  )
}
