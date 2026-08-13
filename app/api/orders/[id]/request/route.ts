import { NextResponse } from "next/server"
import { serverError } from "@/lib/api-errors"
import { getOrder, setOrderPendingRequest } from "@/lib/api/orders-demo-store"
import { addOrderEvent } from "@/lib/api/order-events-store"
import { getSupabase } from "@/lib/supabase/client"
import { USER_EMAIL_HEADER, USER_ROLE_HEADER } from "@/lib/auth-headers"
import type { OrderPendingRequest } from "@/lib/types/order"

// POST /api/orders/:id/request — el asesor SOLICITA devolución o
// confirmación (no ejecuta el cambio de estado: eso sigue siendo admin-only
// vía PATCH /api/orders/:id). A propósito esta ruta NO cae en la regla
// admin-only de proxy.ts (mira el pathname con /request al final, el regex
// de ahí exige que termine justo después del id) — cualquier asesor
// autenticado la necesita para sus propias ventas. El admin también puede
// usarla, aunque normalmente ejecuta directo con el PATCH.

type RequestType = "devolucion" | "confirmacion"
const REQUEST_TYPES: RequestType[] = ["devolucion", "confirmacion"]

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => null)
  const type = body && typeof body === "object" ? (body as Record<string, unknown>).type : null
  const note = body && typeof body === "object" ? (body as Record<string, unknown>).note : null

  if (typeof type !== "string" || !REQUEST_TYPES.includes(type as RequestType)) {
    return NextResponse.json({ error: "tipo_invalido" }, { status: 400 })
  }
  if (note !== null && note !== undefined && typeof note !== "string") {
    return NextResponse.json({ error: "nota_invalida" }, { status: 400 })
  }

  const isAdmin = request.headers.get(USER_ROLE_HEADER) === "admin"
  const sessionEmail = request.headers.get(USER_EMAIL_HEADER)?.trim()
  if (!sessionEmail) {
    return NextResponse.json({ error: "no_autenticado" }, { status: 401 })
  }

  const supabase = getSupabase()
  const noteClean = typeof note === "string" && note.trim() ? note.trim() : null

  if (supabase) {
    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("id, advisor_email, status, deleted_at")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle()

    if (fetchError) {
      return serverError("error_supabase", "orders/request: lectura", fetchError)
    }
    if (!order) {
      return NextResponse.json({ error: "orden_no_encontrada" }, { status: 404 })
    }
    if (!isAdmin && order.advisor_email !== sessionEmail) {
      return NextResponse.json({ error: "sin_permiso" }, { status: 403 })
    }
    if (type === "confirmacion" && order.status === "confirmado") {
      return NextResponse.json({ error: "ya_confirmada" }, { status: 409 })
    }
    if (type === "devolucion" && order.status === "devuelto") {
      return NextResponse.json({ error: "ya_devuelta" }, { status: 409 })
    }

    const { data, error } = await supabase
      .from("orders")
      .update({ pending_request: type, pending_request_by: sessionEmail, pending_request_at: new Date().toISOString() })
      .eq("id", id)
      .select(
        "id, conversationId:conversation_id, pendingRequest:pending_request, " +
          "pendingRequestBy:pending_request_by, pendingRequestAt:pending_request_at",
      )
      .single()

    if (error) {
      return serverError("error_supabase", "orders/request: escritura", error)
    }
    await addOrderEvent(
      id,
      type === "devolucion" ? "solicitud_devolucion" : "solicitud_confirmacion",
      sessionEmail,
      sessionEmail,
      noteClean,
    )
    return NextResponse.json(data)
  }

  const order = getOrder(id)
  if (!order || order.deletedAt !== null) {
    return NextResponse.json({ error: "orden_no_encontrada" }, { status: 404 })
  }
  if (!isAdmin && order.advisorEmail !== sessionEmail) {
    return NextResponse.json({ error: "sin_permiso" }, { status: 403 })
  }
  if (type === "confirmacion" && order.status === "confirmado") {
    return NextResponse.json({ error: "ya_confirmada" }, { status: 409 })
  }
  if (type === "devolucion" && order.status === "devuelto") {
    return NextResponse.json({ error: "ya_devuelta" }, { status: 409 })
  }

  const updated = setOrderPendingRequest(id, type as OrderPendingRequest, sessionEmail)
  await addOrderEvent(
    id,
    type === "devolucion" ? "solicitud_devolucion" : "solicitud_confirmacion",
    sessionEmail,
    sessionEmail,
    noteClean,
  )
  return NextResponse.json(updated)
}
