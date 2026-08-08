import { NextResponse } from "next/server"
import { createContact, listContacts } from "@/lib/api/contacts-demo-store"
import { getChatwootConfig } from "@/lib/chatwoot/client"
import { fetchAndSyncConversations } from "@/lib/api/chatwoot-sync"
import { getSupabase } from "@/lib/supabase/client"
import { listOrders } from "@/lib/api/orders-demo-store"

// El CRM ya no tiene tabla propia en Supabase: sus contactos son los que
// llegan sincronizados desde la API de WhatsApp (ver
// /api/chatwoot/conversations), más los que se agreguen a mano desde el
// panel. Todo vive en este store en memoria — cuando se levante Supabase
// para otra cosa, esta sincronización debería moverse a un workflow de
// n8n que escriba directo en Postgres.
//
// "Pedidos" y "Gastado" sí salen de datos reales: se agregan desde la
// tabla `orders` (Supabase) por customer_phone, y se mezclan aquí encima
// de cada contacto — ver db/orders_schema.sql.

async function getOrderStatsByPhone(): Promise<Map<string, { ordersCount: number; totalSpent: number }>> {
  const stats = new Map<string, { ordersCount: number; totalSpent: number }>()
  const supabase = getSupabase()

  let rows: { phone: string; totalUsd: number }[]
  if (supabase) {
    const { data, error } = await supabase.from("orders").select("phone:customer_phone, totalUsd:total_usd")
    if (error) return stats
    rows = (data ?? []).map((o) => ({ phone: o.phone as string, totalUsd: Number(o.totalUsd) }))
  } else {
    rows = listOrders().map((o) => ({ phone: o.customerPhone, totalUsd: o.totalUsd }))
  }

  for (const row of rows) {
    const existing = stats.get(row.phone) ?? { ordersCount: 0, totalSpent: 0 }
    existing.ordersCount += 1
    existing.totalSpent += row.totalUsd
    stats.set(row.phone, existing)
  }
  return stats
}

export async function GET() {
  // No basta con que CHATWOOT_URL/TOKEN/ACCOUNT_ID estén configuradas —
  // hay que confirmar que la API responde de verdad ahora mismo, si no
  // el badge diría "conectado" aunque Chatwoot esté caído. Corre en
  // paralelo con la agregación de pedidos — son independientes.
  const [syncResult, orderStats] = await Promise.all([
    getChatwootConfig() ? fetchAndSyncConversations() : Promise.resolve(null),
    getOrderStatsByPhone(),
  ])
  const source: "chatwoot" | "demo" = syncResult?.ok ? "chatwoot" : "demo"

  const contacts = listContacts().map((c) => {
    const stats = orderStats.get(c.phone)
    return stats ? { ...c, ordersCount: stats.ordersCount, totalSpent: stats.totalSpent } : c
  })

  return NextResponse.json({ contacts, source })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "cuerpo_invalido" }, { status: 400 })
  }

  const { phone, name, tag } = body as Record<string, unknown>

  if (typeof phone !== "string" || phone.trim().length === 0) {
    return NextResponse.json({ error: "telefono_requerido" }, { status: 400 })
  }
  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "nombre_requerido" }, { status: 400 })
  }
  if (typeof tag !== "string" || tag.trim().length === 0) {
    return NextResponse.json({ error: "etiqueta_invalida" }, { status: 400 })
  }

  const result = createContact({ phone, name, tag })
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 409 })
  }
  return NextResponse.json(result.contact, { status: 201 })
}
