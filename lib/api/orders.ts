import type { NewOrderDb, OrderDb, OrderEvent, OrderStatus } from "@/lib/types/order"
import type { DataSource } from "@/lib/api/shared"

export type { DataSource }

function baseUrl() {
  if (typeof window !== "undefined") return ""
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
}

export interface CustomerLookup {
  customerName: string
  customerCedula: string | null
  state: string
  city: string
  address: string
}

export async function fetchCustomerByPhone(phone: string): Promise<CustomerLookup | null> {
  const res = await fetch(`${baseUrl()}/api/customers/lookup?phone=${encodeURIComponent(phone)}`, {
    cache: "no-store",
  })
  if (!res.ok) return null
  const data = await res.json()
  if (!data.found) return null
  return {
    customerName: data.customerName,
    customerCedula: data.customerCedula,
    state: data.state,
    city: data.city,
    address: data.address,
  }
}

export interface OrderDateRange {
  /** Admin-only — un asesor solo ve sus propias ventas, sin filtro de fecha. */
  from?: string
  to?: string
}

export async function fetchOrders(
  range?: OrderDateRange,
): Promise<{ orders: OrderDb[]; source: DataSource }> {
  const params = new URLSearchParams()
  if (range?.from) params.set("from", range.from)
  if (range?.to) params.set("to", range.to)
  const qs = params.toString()
  const res = await fetch(`${baseUrl()}/api/orders${qs ? `?${qs}` : ""}`, { cache: "no-store" })
  if (!res.ok) throw new Error("No se pudieron cargar las ventas")
  const data = await res.json()
  return { orders: data.orders as OrderDb[], source: data.source as DataSource }
}

export async function addOrder(
  input: NewOrderDb,
): Promise<{ order: OrderDb } | { error: string }> {
  const res = await fetch(`${baseUrl()}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  const data = await res.json()
  if (!res.ok) return { error: data.error ?? "error_desconocido" }
  return { order: data as OrderDb }
}

// Admin-only en el servidor (ver proxy.ts) — ejecuta de verdad el cambio de
// estado. Distinto de requestOrderAction, que el asesor usa para solicitar.
export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
): Promise<{ order: OrderDb } | { error: string }> {
  const res = await fetch(`${baseUrl()}/api/orders/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  })
  const data = await res.json()
  if (!res.ok) return { error: data.error ?? "error_desconocido" }
  return { order: data as OrderDb }
}

export async function requestOrderAction(
  id: string,
  type: "devolucion" | "confirmacion",
  note?: string,
): Promise<{ ok: true } | { error: string }> {
  const res = await fetch(`${baseUrl()}/api/orders/${id}/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, note: note ?? null }),
  })
  const data = await res.json()
  if (!res.ok) return { error: data.error ?? "error_desconocido" }
  return { ok: true }
}

// Admin-only en el servidor — borrado lógico (deleted_at), nunca físico.
export async function deleteOrder(id: string): Promise<{ ok: true } | { error: string }> {
  const res = await fetch(`${baseUrl()}/api/orders/${id}`, { method: "DELETE" })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    return { error: data?.error ?? "error_desconocido" }
  }
  return { ok: true }
}

export async function fetchOrderEvents(id: string): Promise<OrderEvent[]> {
  const res = await fetch(`${baseUrl()}/api/orders/${id}/events`, { cache: "no-store" })
  if (!res.ok) return []
  const data = await res.json()
  return data.events as OrderEvent[]
}
