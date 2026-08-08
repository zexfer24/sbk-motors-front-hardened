'use client'

import { InventoryRow } from './inventory-row'
import type { InventoryItemDb } from '@/lib/types/inventory'

interface InventoryTableProps {
  items: InventoryItemDb[]
  rate: number | null
}

const columns = ['Código', 'Descripción', 'Existencia', 'Precio']

export function InventoryTable({ items, rate }: InventoryTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
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
            {items.map((item, i) => (
              <InventoryRow key={item.id} item={item} index={i} rate={rate} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
