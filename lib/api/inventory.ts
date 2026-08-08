// ============================================================================
// Cliente de inventario. Siempre llama a las rutas internas /api/inventory
// de este proyecto — esas rutas (servidor) hablan directo con Supabase si
// hay credenciales configuradas, o usan el store en memoria si no.
// Ver db/SUPABASE_CONNECTION.md.
//
// Solo lectura — `saprod` también la usa la IA para responder por
// WhatsApp, así que este front nunca escribe ahí.
// ============================================================================

import type { InventoryItemDb } from "@/lib/types/inventory"
import type { DataSource } from "@/lib/api/shared"

export type { DataSource }

export interface InventoryPage {
  items: InventoryItemDb[]
  source: DataSource
  page: number
  totalPages: number
  totalCount: number
}

function baseUrl() {
  if (typeof window !== "undefined") return ""
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
}

export async function fetchInventory(params: { page?: number; q?: string } = {}): Promise<InventoryPage> {
  const search = new URLSearchParams()
  if (params.page && params.page > 1) search.set("page", String(params.page))
  if (params.q) search.set("q", params.q)
  const qs = search.toString()

  const res = await fetch(`${baseUrl()}/api/inventory${qs ? `?${qs}` : ""}`, { cache: "no-store" })
  if (!res.ok) throw new Error("No se pudo cargar el inventario")
  const data = await res.json()
  return {
    items: data.items as InventoryItemDb[],
    source: data.source as DataSource,
    page: data.page as number,
    totalPages: data.totalPages as number,
    totalCount: data.totalCount as number,
  }
}
