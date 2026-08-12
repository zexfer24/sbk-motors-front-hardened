'use client'

import { useRef, useState } from 'react'
import { AlertCircle, Banknote, CalendarDays, ChevronLeft, ChevronRight, MessagesSquare, Send } from 'lucide-react'
import { useDashboard } from '@/lib/hooks/use-dashboard'
import { useExchangeRate } from '@/lib/hooks/use-exchange-rate'
import { caracasFormatLong, caracasToday, isValidDateStr, shiftDateStr } from '@/lib/caracas-time'
import { PageHeader } from '@/components/page-header'
import { KpiCards } from '@/components/dashboard/kpi-cards'
import { BarChartPanel } from '@/components/dashboard/bar-chart-panel'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function DashboardView({ active = true }: { active?: boolean }) {
  const [date, setDate] = useState(caracasToday())
  const isToday = date === caracasToday()
  const dateInputRef = useRef<HTMLInputElement>(null)

  function openDatePicker() {
    const input = dateInputRef.current
    if (!input) return
    if ('showPicker' in input) {
      try {
        input.showPicker()
        return
      } catch {
        // algunos navegadores exigen que el input esté visible/enfocado — cae al click()
      }
    }
    input.click()
  }

  function handleDateInputChange(value: string) {
    if (!value || !isValidDateStr(value)) return
    setDate(value <= caracasToday() ? value : caracasToday())
  }

  const { kpis, hourly, loading, error } = useDashboard(date, active)
  const { rate, loading: rateLoading, available: rateAvailable } = useExchangeRate(date)

  return (
    <>
      <PageHeader eyebrow="Centro de operaciones" title="Panel del día">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-full border border-border bg-card px-1.5 py-1">
            <button
              type="button"
              onClick={() => setDate((d) => shiftDateStr(d, -1))}
              className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label="Día anterior"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={openDatePicker}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-1.5 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                aria-label="Elegir fecha exacta en el calendario"
              >
                <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                {caracasFormatLong(date)}
              </button>
              <input
                ref={dateInputRef}
                type="date"
                value={date}
                max={caracasToday()}
                onChange={(e) => handleDateInputChange(e.target.value)}
                aria-hidden="true"
                tabIndex={-1}
                className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
              />
            </div>

            <button
              type="button"
              onClick={() => setDate((d) => shiftDateStr(d, 1))}
              disabled={isToday}
              className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
              aria-label="Día siguiente"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {!isToday && (
            <button
              type="button"
              onClick={() => setDate(caracasToday())}
              className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Hoy
            </button>
          )}

          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            Tasa BCV ·{' '}
            <span className="font-mono font-semibold text-foreground">
              {rateLoading ? '…' : rateAvailable && rate !== null ? `Bs ${rate.toFixed(2)}` : 'No disponible'}
            </span>
          </span>

          <span
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs',
              isToday
                ? 'border-success/30 bg-success/10 text-success'
                : 'border-border bg-card text-muted-foreground',
            )}
          >
            {isToday && <span className="status-dot h-2 w-2 rounded-full bg-success text-success" />}
            {isToday ? 'En vivo · hoy' : 'Histórico'}
          </span>
        </div>
      </PageHeader>

      <main className="flex flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        {loading && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className={i === 0 ? 'h-28 col-span-2 lg:col-span-1' : 'h-28'} />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-center">
            <AlertCircle className="h-6 w-6 text-primary" />
            <p className="text-sm text-primary">{error}</p>
          </div>
        )}

        {!loading && !error && (
          <>
            <KpiCards kpis={kpis} />

            <div>
              <h2 className="heading-stamp mb-4 text-sm text-muted-foreground">
                Actividad por hora
              </h2>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <BarChartPanel
                  title="Ingresos generados"
                  icon={Banknote}
                  labels={hourly.labels}
                  data={hourly.revenue}
                  hue={25}
                  baseDelay={0}
                  format={(v) => `US$ ${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
                />
                <BarChartPanel
                  title="Interacción de clientes"
                  icon={MessagesSquare}
                  labels={hourly.labels}
                  data={hourly.chats}
                  hue={150}
                  baseDelay={250}
                  format={(v) => `${v} msgs recibidos`}
                  unavailable={!hourly.chatwootAvailable}
                  unavailableMessage="Chatwoot no disponible."
                />
                <BarChartPanel
                  title="Mensajes enviados"
                  icon={Send}
                  labels={hourly.labels}
                  data={hourly.messages}
                  hue={75}
                  baseDelay={500}
                  format={(v) => `${v} msgs`}
                  unavailable={!hourly.chatwootAvailable}
                  unavailableMessage="Chatwoot no disponible."
                />
              </div>
            </div>
          </>
        )}
      </main>
    </>
  )
}
