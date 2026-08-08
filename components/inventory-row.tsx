'use client'

import { cn } from '@/lib/utils'
import { bsToUsd, formatBs, formatUsd } from '@/lib/currency'
import type { InventoryItemDb } from '@/lib/types/inventory'

interface InventoryRowProps {
  item: InventoryItemDb
  index: number
  rate: number | null
}

export function InventoryRow({ item, index, rate }: InventoryRowProps) {
  return (
    <tr
      className={cn(
        'animate-row-assemble group border-b border-border/60 transition-colors last:border-b-0',
        'hover:bg-secondary/40',
      )}
      style={{ animationDelay: `${Math.min(index, 24) * 30}ms` }}
    >
      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground sm:px-6">
        {item.sku}
      </td>
      <td className="px-4 py-3 sm:px-6">
        <span className="text-sm font-medium text-foreground text-pretty">{item.name}</span>
      </td>
      <td
        className={cn(
          'whitespace-nowrap px-4 py-3 text-right font-mono text-sm font-bold tabular-nums sm:px-6',
          item.stock <= 0 && 'text-primary',
          item.stock > 0 && item.stock <= 5 && 'text-warning',
          item.stock > 5 && 'text-foreground',
        )}
      >
        {item.stock}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right sm:px-6">
        <div className="flex flex-col items-end">
          <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
            {formatBs(item.price)}
          </span>
          {rate !== null && (
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {formatUsd(bsToUsd(item.price, rate))}
            </span>
          )}
        </div>
      </td>
    </tr>
  )
}
