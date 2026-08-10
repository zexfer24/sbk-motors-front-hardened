'use client'

import { useMemo, useState } from 'react'
import { AlertCircle, Receipt, Search } from 'lucide-react'
import { useOrders } from '@/lib/hooks/use-orders'
import { OrdersHeader } from '@/components/orders-header'
import { OrdersTable } from '@/components/orders-table'
import { OrderDetailModal } from '@/components/order-detail-modal'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { OrderDb } from '@/lib/types/order'

export function OrdersView({ active = true }: { active?: boolean }) {
  const { orders, source, loading, error, updateStatus } = useOrders(active)
  const [query, setQuery] = useState('')
  const [viewing, setViewing] = useState<OrderDb | null>(null)

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

  return (
    <>
      <OrdersHeader totalOrders={totalOrders} ordersToday={ordersToday} source={source} />

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
          <OrdersTable orders={filtered} onView={setViewing} onUpdateStatus={updateStatus} />
        )}
      </main>

      <OrderDetailModal order={viewing} onClose={() => setViewing(null)} />
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
