'use client'

import { useId } from 'react'
import { ImageOff, Receipt, X } from 'lucide-react'
import { PAYMENT_METHOD_LABELS, ORDER_STATUS_LABELS } from '@/lib/types/order'
import type { OrderDb } from '@/lib/types/order'
import { formatBs, formatUsd } from '@/lib/currency'
import { cn } from '@/lib/utils'

interface OrderDetailModalProps {
  order: OrderDb | null
  onClose: () => void
}

// Solo lectura — pensado para que el asesor copie los datos a su sistema
// de facturación real, que trabaja en Bs.
export function OrderDetailModal({ order, onClose }: OrderDetailModalProps) {
  const titleId = useId()
  if (!order) return null

  const paymentLabel =
    order.paymentMethod === 'otro' && order.paymentMethodOther
      ? order.paymentMethodOther
      : PAYMENT_METHOD_LABELS[order.paymentMethod]

  const casheaPercent =
    order.paymentMethod === 'cashea' && order.casheaTotalUsd && order.casheaInitialUsd
      ? Math.round((order.casheaInitialUsd / order.casheaTotalUsd) * 1000) / 10
      : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="animate-blur-in relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl shadow-black/50"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Receipt className="h-4 w-4" strokeWidth={2.5} />
            </span>
            <h2 id={titleId} className="heading-stamp text-sm text-foreground">
              Orden de {order.customerName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
          <div className="flex items-center justify-between">
            <span
              className={cn(
                'inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-semibold',
                order.status === 'confirmado' && 'bg-success/15 text-success',
                order.status === 'devuelto' && 'bg-primary/15 text-primary',
                order.status === 'pendiente' && 'bg-warning/15 text-warning',
              )}
            >
              {ORDER_STATUS_LABELS[order.status]}
            </span>
            <span className="font-mono text-xs text-muted-foreground">{formatDate(order.createdAt)}</span>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Field label="Asesor" value={order.advisorName || '—'} />
            <Field label="Cliente" value={order.customerName} />
            <Field label="Teléfono" value={order.customerPhone} mono />
            {order.customerCedula && <Field label="Cédula" value={order.customerCedula} mono />}
            <Field label="Ubicación" value={`${order.city}, ${order.state}`} />
            <Field label="Dirección" value={order.address} span2 />
            <Field label="Método de pago" value={paymentLabel} />
            {order.paymentMethod === 'cashea' && (
              <>
                {casheaPercent !== null && (
                  <Field
                    label="Inicial Cashea"
                    value={`${casheaPercent}% (${formatUsd(order.casheaInitialUsd ?? 0)} de ${formatUsd(order.casheaTotalUsd ?? 0)})`}
                  />
                )}
                {order.casheaOrderNumber && (
                  <Field label="N.° de orden Cashea" value={order.casheaOrderNumber} mono />
                )}
                {order.shippingInfo && <Field label="Datos de envío" value={order.shippingInfo} span2 />}
              </>
            )}
          </dl>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-muted-foreground">Artículos</span>
            {order.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin artículos registrados.</p>
            ) : (
              <div className="flex flex-col gap-1 rounded-lg border border-border bg-background/50 p-2.5">
                {order.items.map((it) => (
                  <div key={it.sku} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-foreground">
                      {it.quantity}x {it.name}
                    </span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                      {formatBs(it.price * it.quantity)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between border-t border-border pt-2">
              <span className="text-xs font-semibold text-muted-foreground">Total</span>
              <span className="text-right">
                <span className="block font-mono text-sm font-bold tabular-nums text-foreground">
                  {formatBs(order.totalBs)}
                </span>
                <span className="block font-mono text-xs tabular-nums text-muted-foreground">
                  {formatUsd(order.totalUsd)}
                  {order.exchangeRate ? ` · tasa ${order.exchangeRate.toLocaleString('es-VE')}` : ''}
                </span>
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Captura de pago</span>
            {order.captureUrl ? (
              <a
                href={order.captureUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-fit overflow-hidden rounded-lg border border-border transition-opacity hover:opacity-80"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={order.captureUrl} alt="Captura de pago" className="max-h-56 object-contain" />
              </a>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3.5 py-3 text-xs text-muted-foreground">
                <ImageOff className="h-4 w-4 shrink-0" />
                Sin captura.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  mono,
  span2,
}: {
  label: string
  value: string
  mono?: boolean
  span2?: boolean
}) {
  return (
    <div className={cn('flex flex-col gap-0.5', span2 && 'col-span-2')}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('text-foreground text-pretty', mono && 'font-mono text-xs')}>{value}</dd>
    </div>
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
