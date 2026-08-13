import { NextResponse } from "next/server"
import { serverError } from "@/lib/api-errors"
import { getSupabase } from "@/lib/supabase/client"
import { listOrders } from "@/lib/api/orders-demo-store"
import {
  caracasOperatingHourIndex,
  caracasOperatingHoursBoundsUtc,
  caracasToday,
  isValidDateStr,
  OPERATING_HOUR_END,
  OPERATING_HOUR_START,
} from "@/lib/caracas-time"
import { getChatwootHourlyStats } from "@/lib/chatwoot-stats"

// "Actividad por hora" del Panel — las 24h del día completo (ver
// OPERATING_HOUR_START/END en caracas-time.ts), horario de Venezuela.
// "Ingresos generados" sale de la tabla `orders`; "Interacción de clientes"
// y "Mensajes enviados" salen de Chatwoot (ver lib/chatwoot-stats.ts) — si
// no responde, se devuelven vacíos con `chatwootAvailable: false` en vez de
// inventar actividad.

// Etiqueta cada bloque por la hora en la que TERMINA (01h = medianoche a
// 1am, ..., 24h = 11pm a medianoche), no en la que empieza — así ninguna
// barra queda rotulada "00h", que se leía como si fuera la última hora del
// día en vez de la primera.
const HOURS = Array.from(
  { length: OPERATING_HOUR_END - OPERATING_HOUR_START },
  (_, i) => `${String(OPERATING_HOUR_START + i + 1).padStart(2, "0")}h`,
)

export async function GET(request: Request) {
  const dateParam = new URL(request.url).searchParams.get("date")
  if (dateParam && !isValidDateStr(dateParam)) {
    return NextResponse.json({ error: "fecha_invalida" }, { status: 400 })
  }
  const date = dateParam && dateParam <= caracasToday() ? dateParam : caracasToday()

  const supabase = getSupabase()
  const bounds = caracasOperatingHoursBoundsUtc(date)

  let orders: { createdAt: string; totalUsd: number }[]

  if (supabase) {
    const { data, error } = await supabase
      .from("orders")
      .select("createdAt:created_at, totalUsd:total_usd")
      .gte("created_at", bounds.startUtc)
      .lt("created_at", bounds.endUtc)

    if (error) {
      return serverError("error_supabase", "dashboard/hourly: consulta de orders", error)
    }
    orders = (data ?? []).map((o) => ({
      createdAt: o.createdAt as string,
      totalUsd: Number(o.totalUsd),
    }))
  } else {
    orders = listOrders()
      .filter((o) => o.createdAt >= bounds.startUtc && o.createdAt < bounds.endUtc)
      .map((o) => ({ createdAt: o.createdAt, totalUsd: o.totalUsd }))
  }

  const revenue = new Array(HOURS.length).fill(0)
  for (const o of orders) {
    const idx = caracasOperatingHourIndex(o.createdAt)
    if (idx !== null) revenue[idx] += o.totalUsd
  }

  const chatwoot = await getChatwootHourlyStats(date)

  return NextResponse.json({
    labels: HOURS,
    revenue,
    chats: chatwoot.chats,
    messages: chatwoot.messages,
    chatwootAvailable: chatwoot.available,
    date,
    source: supabase ? "supabase" : "demo",
  })
}
