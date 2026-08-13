'use client'

import { useMemo, useState } from 'react'
import { AlertCircle, Receipt, Search } from 'lucide-react'
import { useOrders } from '@/lib/hooks/use-orders'
import { useAuth } from '@/lib/hooks/use-auth'
import { OrdersHeader } from '@/components/orders-header'
import { OrdersTable } from '@/components/orders-table'
import { OrderDetailModal } from '@/components/order-detail-modal'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { OrderDb } from '@/lib/types/order'

export function OrdersView({ active = true }: { active?: boolean }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  // Rango de fechas: admin-only, ver app/api/orders/route.ts (el asesor
  // nunca manda from/to — el servidor ya lo limita a sus propias ventas).
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const range = isAdmin && (dateFrom || dateTo) ? { from: dateFrom || undefined, to: dateTo || undefined } : undefined

  const { orders, source, loading, error, updateStatus, requestAction, remove } = useOrders(active, range)
  const [query, setQuery] = useState('')
  const [viewing, setViewing] = useState<OrderDb | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q === '') return orders
    return orders.filter(
      (order) =>
        order.customerName.toLowerCase().includes(q) ||
        order.customerPhone.toLowerCase().includes(q) ||
        order.city.toLowerCase().includes(q) ||
        order.state.toLowerCase().includes(q),
    )
  }, [orders, query])

  const totalOrders = orders.length
  const ordersToday = orders.filter((o) => isToday(o.createdAt)).length
  const hasResults = filtered.length > 0

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((o) => o.id))))
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return
    setDeleting(true)
    await Promise.all([...selected].map((id) => remove(id)))
    setSelected(new Set())
    setDeleting(false)
  }

  return (
    <>
      <OrdersHeader
        totalOrders={totalOrders}
        ordersToday={ordersToday}
        source={source}
        isAdmin={isAdmin}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
      />

      <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por cliente, teléfono, ciudad o estado…"
            aria-label="Buscar ventas"
            className="h-11 w-full rounded-lg border border-input bg-card pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-shadow focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {isAdmin && selected.size > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
            <span className="text-sm text-foreground">
              {selected.size} {selected.size === 1 ? 'venta seleccionada' : 'ventas seleccionadas'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={deleting}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-transform active:scale-95 disabled:opacity-60"
              >
                {deleting ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        )}
      </div>

      <main className="flex flex-1 flex-col gap-6 px-4 pb-16 sm:px-6 lg:px-8">
        {loading && (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex border-b border-border bg-secondary/40 px-4 py-3 sm:px-6">
              {['w-16', 'w-32', 'w-24', 'w-24', 'w-24', 'w-10'].map((w, i) => (
                <Skeleton key={i} className={cn('mr-6 h-3', w)} />
              ))}
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="animate-row-assemble flex items-center gap-6 border-b border-border/60 px-4 py-4 last:border-b-0 sm:px-6"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-3.5 w-28 flex-1 sm:flex-none" />
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="ml-auto h-3.5 w-16" />
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-center">
            <AlertCircle className="h-6 w-6 text-primary" />
            <p className="text-sm text-primary">{error}</p>
          </div>
        )}

        {!loading && !error && !hasResults && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
            <Receipt className="h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {orders.length === 0
                ? 'Todavía no hay ventas cerradas. Se registran desde "Cerrar venta" en el chat.'
                : 'No se encontraron ventas para tu búsqueda.'}
            </p>
          </div>
        )}

        {!loading && !error && hasResults && (
          <OrdersTable
            orders={filtered}
            onView={setViewing}
            onUpdateStatus={updateStatus}
            onRequestAction={requestAction}
            isAdmin={isAdmin}
            selected={selected}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
          />
        )}
      </main>

      <OrderDetailModal order={viewing} onClose={() => setViewing(null)} isAdmin={isAdmin} />
    </>
  )
}

function isToday(iso: string) {
  const date = new Date(iso)
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}
