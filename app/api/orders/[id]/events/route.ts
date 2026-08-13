import { NextResponse } from "next/server"
import { serverError } from "@/lib/api-errors"
import { getOrder } from "@/lib/api/orders-demo-store"
import { listOrderEvents } from "@/lib/api/order-events-store"
import { getSupabase } from "@/lib/supabase/client"
import { USER_EMAIL_HEADER, USER_ROLE_HEADER } from "@/lib/auth-headers"

// GET /api/orders/:id/events — log de auditoría de una venta (cierre,
// solicitudes, ejecuciones, eliminación). Mismo criterio de dueño que
// /api/orders/:id/request: admin ve cualquiera, asesor solo el de sus
// propias ventas.

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const isAdmin = request.headers.get(USER_ROLE_HEADER) === "admin"
  const sessionEmail = request.headers.get(USER_EMAIL_HEADER)?.trim()
  if (!sessionEmail) {
    return NextResponse.json({ error: "no_autenticado" }, { status: 401 })
  }

  const supabase = getSupabase()

  if (supabase) {
    const { data: order, error } = await supabase
      .from("orders")
      .select("advisor_email")
      .eq("id", id)
      .maybeSingle()
    if (error) {
      return serverError("error_supabase", "orders/events: lectura", error)
    }
    if (!order) {
      return NextResponse.json({ error: "orden_no_encontrada" }, { status: 404 })
    }
    if (!isAdmin && order.advisor_email !== sessionEmail) {
      return NextResponse.json({ error: "sin_permiso" }, { status: 403 })
    }
  } else {
    const order = getOrder(id)
    if (!order) {
      return NextResponse.json({ error: "orden_no_encontrada" }, { status: 404 })
    }
    if (!isAdmin && order.advisorEmail !== sessionEmail) {
      return NextResponse.json({ error: "sin_permiso" }, { status: 403 })
    }
  }

  const events = await listOrderEvents(id)
  return NextResponse.json({ events })
}
