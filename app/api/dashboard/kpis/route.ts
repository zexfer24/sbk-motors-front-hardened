import { NextResponse } from "next/server"
import { getSupabase } from "@/lib/supabase/client"
import { listOrders } from "@/lib/api/orders-demo-store"
import { caracasDayBoundsUtc, caracasToday, isValidDateStr, shiftDateStr } from "@/lib/caracas-time"
import { getChatwootKpiStats } from "@/lib/chatwoot-stats"
import { serverError } from "@/lib/api-errors"

// KPIs del Panel. "Dinero generado hoy" y "Ventas completadas" salen de la
// tabla `orders` (ver db/orders_schema.sql), acotadas al día completo
// (00:00-23:59 Caracas) — el negocio puede facturar una venta que se
// cerró fuera del horario de atención, y esa venta no debe desaparecer de
// las cifras del día. La ventana de 9am-9pm solo aplica a la gráfica de
// "Actividad por hora" (ver app/api/dashboard/hourly/route.ts), donde sí
// tiene sentido visual. "Nuevos chats", "Clientes totales" y "Tasa de
// éxito" salen de Chatwoot (ver lib/chatwoot-stats.ts) — si Chatwoot no
// responde, se devuelven marcados como `available: false` en vez de
// inventar un número.

interface DashboardKpi {
  id: string
  label: string
  value: string
  trend: number
  hint: string
  available: boolean
}

function percentTrend(today: number, yesterday: number): number {
  if (yesterday === 0) return today > 0 ? 100 : 0
  return Math.round(((today - yesterday) / yesterday) * 1000) / 10
}

function isWithin(iso: string, bounds: { startUtc: string; endUtc: string }) {
  return iso >= bounds.startUtc && iso < bounds.endUtc
}

export async function GET(request: Request) {
  const dateParam = new URL(request.url).searchParams.get("date")
  if (dateParam && !isValidDateStr(dateParam)) {
    return NextResponse.json({ error: "fecha_invalida" }, { status: 400 })
  }
  const date = dateParam && dateParam <= caracasToday() ? dateParam : caracasToday()

  const supabase = getSupabase()
  const todayBounds = caracasDayBoundsUtc(date)
  const yesterdayBounds = caracasDayBoundsUtc(shiftDateStr(date, -1))

  let todayTotals: number[]
  let yesterdayTotals: number[]

  if (supabase) {
    const [todayRes, yesterdayRes] = await Promise.all([
      supabase
        .from("orders")
        .select("total_usd")
        .is("deleted_at", null)
        .gte("created_at", todayBounds.startUtc)
        .lt("created_at", todayBounds.endUtc),
      supabase
        .from("orders")
        .select("total_usd")
        .is("deleted_at", null)
        .gte("created_at", yesterdayBounds.startUtc)
        .lt("created_at", yesterdayBounds.endUtc),
    ])

    if (todayRes.error || yesterdayRes.error) {
      return serverError(
        "error_supabase",
        "dashboard/kpis: consulta de orders",
        todayRes.error ?? yesterdayRes.error,
      )
    }

    todayTotals = (todayRes.data ?? []).map((o) => Number(o.total_usd))
    yesterdayTotals = (yesterdayRes.data ?? []).map((o) => Number(o.total_usd))
  } else {
    const all = listOrders()
    todayTotals = all.filter((o) => isWithin(o.createdAt, todayBounds)).map((o) => o.totalUsd)
    yesterdayTotals = all.filter((o) => isWithin(o.createdAt, yesterdayBounds)).map((o) => o.totalUsd)
  }

  const revenueToday = todayTotals.reduce((sum, v) => sum + v, 0)
  const revenueYesterday = yesterdayTotals.reduce((sum, v) => sum + v, 0)
  const salesToday = todayTotals.length
  const salesYesterday = yesterdayTotals.length

  const usd = (v: number) => `US$ ${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`

  const chatwoot = await getChatwootKpiStats(date)
  const successRate =
    chatwoot.available && chatwoot.newChatsToday > 0
      ? Math.round((salesToday / chatwoot.newChatsToday) * 1000) / 10
      : null

  const kpis: DashboardKpi[] = [
    {
      id: "revenue",
      label: "Dinero generado hoy",
      value: usd(revenueToday),
      trend: percentTrend(revenueToday, revenueYesterday),
      hint: `vs. ayer (${usd(revenueYesterday)})`,
      available: true,
    },
    {
      id: "sales",
      label: "Ventas completadas",
      value: String(salesToday),
      trend: percentTrend(salesToday, salesYesterday),
      hint: `vs. ayer (${salesYesterday})`,
      available: true,
    },
    {
      id: "new-chats",
      label: "Nuevos chats iniciados",
      value: chatwoot.available ? String(chatwoot.newChatsToday) : "—",
      trend: chatwoot.available ? percentTrend(chatwoot.newChatsToday, chatwoot.newChatsYesterday) : 0,
      hint: chatwoot.available ? `vs. ayer (${chatwoot.newChatsYesterday})` : "Chatwoot no disponible",
      available: chatwoot.available,
    },
    {
      id: "customers",
      label: "Clientes totales",
      value: chatwoot.available ? String(chatwoot.totalCustomers) : "—",
      trend: chatwoot.available ? percentTrend(chatwoot.totalCustomers, chatwoot.totalCustomersYesterday) : 0,
      hint: chatwoot.available ? "acumulado histórico" : "Chatwoot no disponible",
      available: chatwoot.available,
    },
    {
      id: "success",
      label: "Tasa de éxito en venta",
      value: successRate !== null ? `${successRate}%` : "—",
      trend: 0,
      hint: chatwoot.available
        ? chatwoot.newChatsToday > 0
          ? `${salesToday} ventas / ${chatwoot.newChatsToday} chats`
          : "Sin chats hoy"
        : "Chatwoot no disponible",
      available: successRate !== null,
    },
  ]

  return NextResponse.json({ kpis, date, source: supabase ? "supabase" : "demo" })
}
