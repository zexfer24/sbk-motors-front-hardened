import type { NewOrderDb, OrderDb, OrderStatus } from "@/lib/types/order"
import type { DataSource } from "@/lib/api/shared"

export type { DataSource }

function baseUrl() {
  if (typeof window !== "undefined") return ""
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
}

export async function fetchOrders(): Promise<{ orders: OrderDb[]; source: DataSource }> {
  const res = await fetch(`${baseUrl()}/api/orders`, { cache: "no-store" })
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
