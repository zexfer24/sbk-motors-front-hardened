// Cálculo de totales de una orden — vive aparte de los componentes/rutas
// para poder probarlo con pruebas unitarias sin levantar Next.js.

import { bsToUsd, roundUpToDime } from "@/lib/currency"

export interface OrderItemLike {
  price: number
  quantity: number
}

export function sumItemsBs(items: OrderItemLike[]): number {
  return items.reduce((sum, it) => sum + it.price * it.quantity, 0)
}

// Monto total de la orden en Cashea: el precio completo del carrito
// (Bs -> USD), redondeado hacia arriba al décimo de dólar más cercano a
// favor del negocio. Se calcula siempre en el servidor a partir de los
// artículos — nunca se confía en un monto que mande el cliente.
export function computeCasheaTotalUsd(items: OrderItemLike[], rate: number): number {
  return roundUpToDime(bsToUsd(sumItemsBs(items), rate))
}

export interface OrderTotals {
  totalBs: number
  totalUsd: number
}

// Total que se registra en la orden (lo que alimenta Ventas y el Panel):
// para Cashea es lo que el cliente pagó de inicial hoy — lo que de verdad
// se recaudó —, congelado a la tasa BCV del día; para el resto de métodos
// de pago es el carrito completo.
export function computeOrderTotals(params: {
  items: OrderItemLike[]
  exchangeRate: number
  isCashea: boolean
  casheaInitialUsd: number | null
}): OrderTotals {
  const { items, exchangeRate, isCashea, casheaInitialUsd } = params

  if (isCashea && casheaInitialUsd !== null) {
    return {
      totalUsd: casheaInitialUsd,
      totalBs: Math.round(casheaInitialUsd * exchangeRate * 100) / 100,
    }
  }

  const totalBs = sumItemsBs(items)
  return { totalBs, totalUsd: exchangeRate ? bsToUsd(totalBs, exchangeRate) : 0 }
}
