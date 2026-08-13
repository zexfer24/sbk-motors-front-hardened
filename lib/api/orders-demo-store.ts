// ============================================================================
// Fallback en memoria — solo entra en juego si SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY no están configuradas. Arranca vacío a
// propósito: sin datos mock. Las ventas reales viven en Supabase; ver
// db/orders_schema.sql.
// ============================================================================

import type { OrderDb, OrderStatus } from "@/lib/types/order"

// El route handler (app/api/orders/route.ts) computa totalBs/exchangeRate/
// totalUsd/status en el servidor antes de llamar aquí — por eso este tipo
// es más amplio que NewOrderDb (el que ve el cliente al armar el POST).
type CreateOrderInput = Omit<OrderDb, "id" | "createdAt">

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

export function listOrders(): OrderDb[] {
  return [...getStore()].sort((a, b) =>
    a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? 1 : -1,
  )
}

export function createOrder(input: CreateOrderInput): OrderDb {
  const order: OrderDb = {
    id: makeId(),
    ...input,
    createdAt: new Date().toISOString(),
  }
  getStore().push(order)
  return order
}

export function updateOrderStatus(id: string, status: OrderStatus): OrderDb | null {
  const store = getStore()
  const order = store.find((o) => o.id === id)
  if (!order) return null
  order.status = status
  return order
}

// Para prellenar "Cerrar venta" con los datos de la última vez que ese
// número compró — ver app/api/customers/lookup/route.ts.
export function findLatestOrderByPhone(phone: string): OrderDb | null {
  const matches = getStore().filter((o) => o.customerPhone === phone)
  if (matches.length === 0) return null
  return matches.reduce((latest, o) => (o.createdAt > latest.createdAt ? o : latest))
}
