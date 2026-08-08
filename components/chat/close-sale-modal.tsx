'use client'

import { useEffect, useId, useState } from 'react'
import { Check, Handshake, ImageOff, Loader2, Minus, Plus, Search, Trash2, X } from 'lucide-react'
import type { ChatwootConversation, ChatwootMessage } from '@/lib/types/chatwoot'
import { PAYMENT_METHOD_LABELS, type NewOrderDb, type OrderItem, type PaymentMethod } from '@/lib/types/order'
import { VENEZUELA_STATES } from '@/lib/venezuela-states'
import { fetchInventory } from '@/lib/api/inventory'
import type { InventoryItemDb } from '@/lib/types/inventory'
import { cn } from '@/lib/utils'
import { bsToUsd, formatBs, formatUsd } from '@/lib/currency'
import { computeCasheaTotalUsd, sumItemsBs } from '@/lib/order-totals'
import { useExchangeRate } from '@/lib/hooks/use-exchange-rate'

const PAYMENT_METHODS = Object.entries(PAYMENT_METHOD_LABELS) as [PaymentMethod, string][]

interface CloseSaleModalProps {
  open: boolean
  conversation: ChatwootConversation
  messages: ChatwootMessage[]
  onClose: () => void
  onSubmit: (input: NewOrderDb) => Promise<{ error: string } | { ok: true }>
}

export function CloseSaleModal({
  open,
  conversation,
  messages,
  onClose,
  onSubmit,
}: CloseSaleModalProps) {
  const formId = useId()
  const { rate } = useExchangeRate()
  // El asesor no es editable — es quien está interviniendo la conversación
  // de verdad en Chatwoot, para que la venta quede atribuida a quien
  // realmente la cerró.
  const advisorName = conversation.assigneeName ?? ''
  const [customerName, setCustomerName] = useState(conversation.contactName)
  const [customerPhone, setCustomerPhone] = useState(conversation.phone)
  const [customerCedula, setCustomerCedula] = useState('')
  const [state, setState] = useState('')
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pago_movil')
  const [paymentMethodOther, setPaymentMethodOther] = useState('')
  const [shippingInfo, setShippingInfo] = useState('')
  const [casheaOrderNumber, setCasheaOrderNumber] = useState('')
  const [casheaInitialUsd, setCasheaInitialUsd] = useState('')
  const [captureUrl, setCaptureUrl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [itemQuery, setItemQuery] = useState('')
  const [itemResults, setItemResults] = useState<InventoryItemDb[]>([])
  const [itemSearching, setItemSearching] = useState(false)
  const [cart, setCart] = useState<OrderItem[]>([])

  useEffect(() => {
    if (!itemQuery.trim()) {
      setItemResults([])
      return
    }
    let cancelled = false
    setItemSearching(true)
    const timer = setTimeout(async () => {
      try {
        const data = await fetchInventory({ q: itemQuery.trim() })
        if (!cancelled) setItemResults(data.items)
      } catch {
        if (!cancelled) setItemResults([])
      } finally {
        if (!cancelled) setItemSearching(false)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [itemQuery])

  const cartTotal = sumItemsBs(cart)

  if (!open) return null

  const images = messages.flatMap((m) => m.attachments).filter((a) => a.kind === 'image')
  // El "monto total de orden" de Cashea lo calcula el sistema a partir del
  // carrito (Bs -> USD, redondeado hacia arriba al décimo de dólar más
  // cercano, a favor del negocio: $99,71 -> $99,80) — no es editable, así
  // no depende de que el asesor lo transcriba bien a mano. El servidor
  // recalcula lo mismo al recibir la venta, ver app/api/orders/route.ts.
  const casheaTotalNum = rate !== null ? computeCasheaTotalUsd(cart, rate) : 0
  const casheaInitialNum = Number(casheaInitialUsd)
  const casheaPercent =
    casheaTotalNum > 0 && casheaInitialNum > 0
      ? Math.round((casheaInitialNum / casheaTotalNum) * 1000) / 10
      : null

  function addToCart(item: InventoryItemDb) {
    setCart((prev) => {
      const existing = prev.find((it) => it.sku === item.sku)
      if (existing) {
        return prev.map((it) => (it.sku === item.sku ? { ...it, quantity: it.quantity + 1 } : it))
      }
      return [...prev, { sku: item.sku, name: item.name, price: item.price, quantity: 1 }]
    })
    setItemQuery('')
    setItemResults([])
  }

  function updateQuantity(sku: string, quantity: number) {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((it) => it.sku !== sku))
      return
    }
    setCart((prev) => prev.map((it) => (it.sku === sku ? { ...it, quantity } : it)))
  }

  function removeFromCart(sku: string) {
    setCart((prev) => prev.filter((it) => it.sku !== sku))
  }

  function reset() {
    setCustomerName(conversation.contactName)
    setCustomerPhone(conversation.phone)
    setCustomerCedula('')
    setState('')
    setCity('')
    setAddress('')
    setPaymentMethod('pago_movil')
    setPaymentMethodOther('')
    setShippingInfo('')
    setCasheaOrderNumber('')
    setCasheaInitialUsd('')
    setCaptureUrl(null)
    setItemQuery('')
    setItemResults([])
    setCart([])
    setFormError(null)
  }

  function handleClose() {
    if (submitting) return
    reset()
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (!advisorName.trim()) {
      setFormError('Debes intervenir la conversación antes de cerrar la venta.')
      return
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      setFormError('Completa el nombre y el número del cliente.')
      return
    }
    if (!customerCedula.trim()) {
      setFormError('Ingresa la cédula del cliente.')
      return
    }
    if (cart.length === 0) {
      setFormError('Agrega al menos un artículo al pedido.')
      return
    }
    if (!state) {
      setFormError('Selecciona el estado.')
      return
    }
    if (!city.trim()) {
      setFormError('Completa la ciudad.')
      return
    }
    if (!address.trim()) {
      setFormError('Completa la dirección.')
      return
    }
    if (paymentMethod === 'otro' && !paymentMethodOther.trim()) {
      setFormError('Especifica el método de pago.')
      return
    }
    if (paymentMethod === 'cashea') {
      if (!casheaOrderNumber.trim()) {
        setFormError('Ingresa el número de orden de Cashea.')
        return
      }
      if (!(casheaTotalNum > 0)) {
        setFormError('No se pudo calcular el monto total de la orden (verifica la tasa BCV).')
        return
      }
      if (!(casheaInitialNum > 0)) {
        setFormError('Ingresa el monto inicial pagado.')
        return
      }
      if (casheaInitialNum > casheaTotalNum) {
        setFormError('El monto inicial no puede ser mayor al monto total de la orden.')
        return
      }
    }

    setSubmitting(true)
    const result = await onSubmit({
      conversationId: conversation.id,
      advisorName: advisorName.trim(),
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      customerCedula: customerCedula.trim() || null,
      state,
      city: city.trim(),
      address: address.trim(),
      paymentMethod,
      paymentMethodOther: paymentMethod === 'otro' ? paymentMethodOther.trim() : null,
      shippingInfo: shippingInfo.trim(),
      casheaOrderNumber: paymentMethod === 'cashea' ? casheaOrderNumber.trim() : null,
      casheaTotalUsd: paymentMethod === 'cashea' ? casheaTotalNum : null,
      casheaInitialUsd: paymentMethod === 'cashea' ? casheaInitialNum : null,
      captureUrl,
      items: cart,
    })
    setSubmitting(false)

    if ('error' in result) {
      setFormError('No se pudo cerrar la venta. Intenta de nuevo.')
      return
    }

    reset()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={handleClose}
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${formId}-title`}
        className="animate-blur-in relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl shadow-black/50"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Handshake className="h-4 w-4" strokeWidth={2.5} />
            </span>
            <h2 id={`${formId}-title`} className="heading-stamp text-sm text-foreground">
              Cerrar venta
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5"
        >
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">
              Asesor que cierra la venta
            </span>
            {advisorName ? (
              <div className="rounded-lg border border-input bg-secondary/40 px-3.5 py-2.5 text-sm font-medium text-foreground">
                {advisorName}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-warning/50 bg-warning/10 px-3.5 py-2.5 text-xs text-warning">
                Debes intervenir esta conversación antes de poder cerrar la venta.
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${formId}-name`} className="text-xs font-semibold text-muted-foreground">
              Nombre del cliente
            </label>
            <input
              id={`${formId}-name`}
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${formId}-phone`} className="text-xs font-semibold text-muted-foreground">
                Número del cliente
              </label>
              <input
                id={`${formId}-phone`}
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="rounded-lg border border-input bg-background px-3.5 py-2.5 font-mono text-sm text-foreground outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${formId}-cedula`} className="text-xs font-semibold text-muted-foreground">
                Cédula
              </label>
              <input
                id={`${formId}-cedula`}
                value={customerCedula}
                onChange={(e) => setCustomerCedula(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                placeholder="Ej. 30610150"
                className="rounded-lg border border-input bg-background px-3.5 py-2.5 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${formId}-state`} className="text-xs font-semibold text-muted-foreground">
                Estado
              </label>
              <select
                id={`${formId}-state`}
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Selecciona…</option>
                {VENEZUELA_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${formId}-city`} className="text-xs font-semibold text-muted-foreground">
                Ciudad
              </label>
              <input
                id={`${formId}-city`}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Ej. Barinas"
                className="rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${formId}-address`} className="text-xs font-semibold text-muted-foreground">
              Dirección
            </label>
            <textarea
              id={`${formId}-address`}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              placeholder="Referencia de la dirección de entrega"
              className="resize-none rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">
              Artículos del pedido
            </span>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={itemQuery}
                onChange={(e) => setItemQuery(e.target.value)}
                placeholder="Buscar artículo por descripción o código…"
                className="w-full rounded-lg border border-input bg-background py-2.5 pl-9 pr-3.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {itemQuery.trim() && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-popover">
                {itemSearching ? (
                  <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Buscando…
                  </div>
                ) : itemResults.length === 0 ? (
                  <div className="px-3 py-2.5 text-xs text-muted-foreground">Sin resultados.</div>
                ) : (
                  itemResults.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => addToCart(item)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-secondary"
                    >
                      <span className="truncate text-foreground">{item.name}</span>
                      <span className="shrink-0 text-right font-mono text-xs text-muted-foreground">
                        {formatBs(item.price)}
                        {rate !== null && (
                          <span className="block text-[0.65rem]">{formatUsd(bsToUsd(item.price, rate))}</span>
                        )}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}

            {cart.length > 0 && (
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-background/50 p-2.5">
                {cart.map((it) => (
                  <div key={it.sku} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{it.name}</span>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updateQuantity(it.sku, it.quantity - 1)}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-6 text-center font-mono text-xs tabular-nums text-foreground">
                        {it.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(it.sku, it.quantity + 1)}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <span className="w-24 shrink-0 text-right font-mono text-xs tabular-nums text-foreground">
                      {formatBs(it.price * it.quantity)}
                      {rate !== null && (
                        <span className="block text-[0.65rem] text-muted-foreground">
                          {formatUsd(bsToUsd(it.price * it.quantity, rate))}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFromCart(it.sku)}
                      className="shrink-0 text-muted-foreground hover:text-primary"
                      aria-label={`Quitar ${it.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-border pt-2">
                  <span className="text-xs font-semibold text-muted-foreground">Total</span>
                  <span className="text-right">
                    <span className="block font-mono text-sm font-bold tabular-nums text-foreground">
                      {formatBs(cartTotal)}
                    </span>
                    {rate !== null && (
                      <span className="block font-mono text-xs tabular-nums text-muted-foreground">
                        {formatUsd(bsToUsd(cartTotal, rate))}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${formId}-payment`} className="text-xs font-semibold text-muted-foreground">
              Método de pago
            </label>
            <select
              id={`${formId}-payment`}
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
            >
              {PAYMENT_METHODS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {paymentMethod === 'otro' && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${formId}-payment-other`} className="text-xs font-semibold text-muted-foreground">
                Especifica el método de pago
              </label>
              <input
                id={`${formId}-payment-other`}
                value={paymentMethodOther}
                onChange={(e) => setPaymentMethodOther(e.target.value)}
                className="rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
              />
            </div>
          )}

          {paymentMethod === 'cashea' && (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-background/50 p-3">
              <span className="text-xs font-semibold text-muted-foreground">Datos de Cashea</span>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Monto total de orden (US$)
                  </span>
                  <div className="rounded-lg border border-input bg-secondary/40 px-3.5 py-2.5 font-mono text-sm text-foreground">
                    {casheaTotalNum > 0 ? formatUsd(casheaTotalNum) : '—'}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`${formId}-cashea-initial`} className="text-xs font-semibold text-muted-foreground">
                    Monto inicial pagado (US$)
                  </label>
                  <input
                    id={`${formId}-cashea-initial`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={casheaInitialUsd}
                    onChange={(e) => setCasheaInitialUsd(e.target.value)}
                    placeholder="Ej. 50"
                    className="rounded-lg border border-input bg-background px-3.5 py-2.5 font-mono text-sm text-foreground outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>

              {casheaPercent !== null && (
                <p className="text-xs text-foreground">
                  Se lo lleva con el <span className="font-semibold text-primary">{casheaPercent}%</span> inicial.
                </p>
              )}

              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${formId}-cashea-order`} className="text-xs font-semibold text-muted-foreground">
                  Número de orden Cashea
                </label>
                <input
                  id={`${formId}-cashea-order`}
                  value={casheaOrderNumber}
                  onChange={(e) => setCasheaOrderNumber(e.target.value)}
                  placeholder="El que da Cashea al procesar la compra"
                  className="rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${formId}-shipping`} className="text-xs font-semibold text-muted-foreground">
                  Datos de envío (opcional)
                </label>
                <textarea
                  id={`${formId}-shipping`}
                  value={shippingInfo}
                  onChange={(e) => setShippingInfo(e.target.value)}
                  rows={2}
                  placeholder="Agencia, dirección, cuota, etc."
                  className="resize-none rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">
              Captura de pago (opcional)
            </span>
            {images.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3.5 py-3 text-xs text-muted-foreground">
                <ImageOff className="h-4 w-4 shrink-0" />
                No hay imágenes en este chat.
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                {images.map((att) => {
                  const selected = captureUrl === att.fileUrl
                  return (
                    <button
                      key={att.id}
                      type="button"
                      onClick={() => setCaptureUrl(selected ? null : att.fileUrl)}
                      className={cn(
                        'relative aspect-square overflow-hidden rounded-md border transition-all',
                        selected
                          ? 'border-primary ring-2 ring-primary/40'
                          : 'border-border hover:opacity-80',
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={att.fileUrl}
                        alt="Adjunto del chat"
                        className="h-full w-full object-cover"
                      />
                      {selected && (
                        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {formError && (
            <p role="alert" className="rounded-lg bg-primary/10 px-3 py-2 text-xs text-primary">
              {formError}
            </p>
          )}

          <div className="mt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="power-glow flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform active:scale-95 disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? 'Cerrando…' : 'Confirmar cierre'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
