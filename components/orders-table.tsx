'use client'

import { OrdersRow } from './orders-row'
import type { OrderDb, OrderStatus } from '@/lib/types/order'

interface OrdersTableProps {
  orders: OrderDb[]
  onView: (order: OrderDb) => void
  onUpdateStatus: (id: string, status: OrderStatus) => Promise<unknown>
  onRequestAction: (id: string, type: 'devolucion' | 'confirmacion') => Promise<unknown>
  isAdmin: boolean
  selected: Set<string>
  onToggleSelect: (id: string) => void
  onToggleSelectAll: () => void
}

export function OrdersTable({
  orders,
  onView,
  onUpdateStatus,
  onRequestAction,
  isAdmin,
  selected,
  onToggleSelect,
  onToggleSelectAll,
}: OrdersTableProps) {
  const columns = [
    'Fecha',
    'Asesor',
    'Cliente',
    'Teléfono',
    'Ubicación',
    'Artículos',
    'Total',
    'Método de pago',
    'Captura',
    'Estado',
    'Acciones',
  ]

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border bg-secondary/40">
              {isAdmin && (
                <th className="w-10 px-4 py-3 sm:px-6">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todas las ventas visibles"
                    checked={orders.length > 0 && selected.size === orders.length}
                    onChange={onToggleSelectAll}
                    className="h-3.5 w-3.5 rounded border-input accent-primary"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col}
                  className="whitespace-nowrap px-4 py-3 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground sm:px-6"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map((order, i) => (
              <OrdersRow
                key={order.id}
                order={order}
                index={i}
                onView={onView}
                onUpdateStatus={onUpdateStatus}
                onRequestAction={onRequestAction}
                isAdmin={isAdmin}
                selected={selected.has(order.id)}
                onToggleSelect={() => onToggleSelect(order.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
