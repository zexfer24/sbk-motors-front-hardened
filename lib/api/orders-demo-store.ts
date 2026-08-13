// ============================================================================
// Fallback en memoria — solo entra en juego si SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY no están configuradas. Arranca vacío a
// propósito: sin datos mock. Las ventas reales viven en Supabase; ver
// db/orders_schema.sql.
// ============================================================================

import type { OrderDb, OrderPendingRequest, OrderStatus } from "@/lib/types/order"

// El route handler (app/api/orders/route.ts) computa totalBs/exchangeRate/
// totalUsd/status/advisorEmail en el servidor antes de llamar aquí — por eso
// este tipo es más amplio que NewOrderDb (el que ve el cliente al armar el
// POST).
type CreateOrderInput = Omit<OrderDb, "id" | "createdAt" | "pendingRequest" | "pendingRequestBy" | "pendingRequestAt" | "deletedAt">

function makeId() {
  return globalThis.crypto.randomUUID()
}

const globalForStore = globalThis as unknown as { __ordersStore?: OrderDb[] }

function getStore(): OrderDb[] {
  if (!globalForStore.__ordersStore) {
    globalForStore.__ordersStore = []
  }
  return globalForStore.__ordersStore
}

export function listOrders(filter?: { advisorEmail?: string }): OrderDb[] {
  let orders = getStore().filter((o) => o.deletedAt === null)
  if (filter?.advisorEmail) orders = orders.filter((o) => o.advisorEmail === filter.advisorEmail)
  return [...orders].sort((a, b) => (a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? 1 : -1))
}

export function getOrder(id: string): OrderDb | null {
  return getStore().find((o) => o.id === id) ?? null
}

export function createOrder(input: CreateOrderInput): OrderDb {
  const order: OrderDb = {
    ...input,
    id: makeId(),
    pendingRequest: null,
    pendingRequestBy: null,
    pendingRequestAt: null,
    deletedAt: null,
    createdAt: new Date().toISOString(),
  }
  getStore().push(order)
  return order
}

export function updateOrderStatus(id: string, status: OrderStatus): OrderDb | null {
  const order = getStore().find((o) => o.id === id)
  if (!order) return null
  order.status = status
  order.pendingRequest = null
  order.pendingRequestBy = null
  order.pendingRequestAt = null
  return order
}

export function setOrderPendingRequest(
  id: string,
  request: OrderPendingRequest,
  by: string,
): OrderDb | null {
  const order = getStore().find((o) => o.id === id)
  if (!order) return null
  order.pendingRequest = request
  order.pendingRequestBy = by
  order.pendingRequestAt = new Date().toISOString()
  return order
}

export function softDeleteOrder(id: string): OrderDb | null {
  const order = getStore().find((o) => o.id === id)
  if (!order) return null
  order.deletedAt = new Date().toISOString()
  return order
}

// Para prellenar "Cerrar venta" con los datos de la última vez que ese
// número compró — ver app/api/customers/lookup/route.ts.
export function findLatestOrderByPhone(phone: string): OrderDb | null {
  const matches = getStore().filter((o) => o.customerPhone === phone && o.deletedAt === null)
  if (matches.length === 0) return null
  return matches.reduce((latest, o) => (o.createdAt > latest.createdAt ? o : latest))
}
