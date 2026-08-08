'use client'

import { OrdersRow } from './orders-row'
import type { OrderDb, OrderStatus } from '@/lib/types/order'

interface OrdersTableProps {
  orders: OrderDb[]
  onView: (order: OrderDb) => void
  onUpdateStatus: (id: string, status: OrderStatus) => Promise<unknown>
}

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

export function OrdersTable({ orders, onView, onUpdateStatus }: OrdersTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border bg-secondary/40">
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
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
