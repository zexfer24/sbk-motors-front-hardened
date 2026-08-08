'use client'

import { useState } from 'react'
import { CheckCircle2, Eye, ImageOff, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@/lib/types/order'
import type { OrderDb, OrderStatus } from '@/lib/types/order'
import { formatBs, formatUsd } from '@/lib/currency'

interface OrdersRowProps {
  order: OrderDb
  index: number
  onView: (order: OrderDb) => void
  onUpdateStatus: (id: string, status: OrderStatus) => Promise<unknown>
}

export function OrdersRow({ order, index, onView, onUpdateStatus }: OrdersRowProps) {
  const [pending, setPending] = useState<OrderStatus | null>(null)

  async function handleStatus(status: OrderStatus) {
    setPending(status)
    await onUpdateStatus(order.id, status)
    setPending(null)
  }

  const paymentLabel =
    order.paymentMethod === 'otro' && order.paymentMethodOther
      ? order.paymentMethodOther
      : PAYMENT_METHOD_LABELS[order.paymentMethod]

  const casheaPercent =
    order.paymentMethod === 'cashea' && order.casheaTotalUsd && order.casheaInitialUsd
      ? Math.round((order.casheaInitialUsd / order.casheaTotalUsd) * 1000) / 10
      : null

  const items = order.items ?? []
  const itemsSummary =
    items.length === 0
      ? '—'
      : items.length === 1
        ? `${items[0].quantity}x ${items[0].name}`
        : `${items[0].quantity}x ${items[0].name} +${items.length - 1} más`

  return (
    <tr
      className={cn(
        'animate-row-assemble group border-b border-border/60 transition-colors last:border-b-0',
        'hover:bg-secondary/40',
      )}
      style={{ animationDelay: `${Math.min(index, 24) * 30}ms` }}
    >
      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground sm:px-6">
        {formatDate(order.createdAt)}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground sm:px-6">
        {order.advisorName || '—'}
      </td>
      <td className="px-4 py-3 sm:px-6">
        <span className="text-sm font-medium text-foreground text-pretty">{order.customerName}</span>
      </td>
      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground sm:px-6">
        {order.customerPhone}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground sm:px-6">
        {order.city}, {order.state}
      </td>
      <td
        className="max-w-[220px] truncate px-4 py-3 text-sm text-foreground sm:px-6"
        title={items.map((it) => `${it.quantity}x ${it.name}`).join(', ')}
      >
        {itemsSummary}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right sm:px-6">
        {items.length > 0 ? (
          <div className="flex flex-col items-end">
            <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
              {formatBs(order.totalBs)}
            </span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {formatUsd(order.totalUsd)}
            </span>
          </div>
        ) : (
          '—'
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground sm:px-6">
        {paymentLabel}
        {casheaPercent !== null && (
          <span className="block font-mono text-[0.65rem] text-muted-foreground">
            {casheaPercent}% inicial{order.casheaOrderNumber ? ` · #${order.casheaOrderNumber}` : ''}
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-center sm:px-6">
        {order.captureUrl ? (
          <a
            href={order.captureUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block overflow-hidden rounded-md border border-border transition-opacity hover:opacity-80"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={order.captureUrl} alt="Captura de pago" className="h-10 w-10 object-cover" />
          </a>
        ) : (
          <ImageOff className="mx-auto h-4 w-4 text-muted-foreground/50" />
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 sm:px-6">
        <span
          className={cn(
            'inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[0.7rem] font-semibold',
            order.status === 'confirmado' && 'bg-success/15 text-success',
            order.status === 'devuelto' && 'bg-primary/15 text-primary',
            order.status === 'pendiente' && 'bg-warning/15 text-warning',
          )}
        >
          {ORDER_STATUS_LABELS[order.status]}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-3 sm:px-6">
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => onView(order)}
            title="Ver orden completa"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleStatus('confirmado')}
            disabled={order.status === 'confirmado' || pending !== null}
            title="Confirmar venta"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-success/15 hover:text-success disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleStatus('devuelto')}
            disabled={order.status === 'devuelto' || pending !== null}
            title="Marcar devolución"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
