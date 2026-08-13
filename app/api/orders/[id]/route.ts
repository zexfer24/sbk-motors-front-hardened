import { NextResponse } from "next/server"
import { serverError } from "@/lib/api-errors"
import { getOrder, softDeleteOrder, updateOrderStatus as updateDemoOrderStatus } from "@/lib/api/orders-demo-store"
import { addOrderEvent } from "@/lib/api/order-events-store"
import { getSupabase } from "@/lib/supabase/client"
import { USER_EMAIL_HEADER } from "@/lib/auth-headers"
import type { OrderStatus } from "@/lib/types/order"

// PATCH /api/orders/:id — cambia el estado (Confirmar/Devolución en
// Ventas), admin-only (ver proxy.ts). Limpia cualquier solicitud pendiente
// del asesor y registra el evento real en order_events.
//
// DELETE /api/orders/:id — borrado lógico (deleted_at), también admin-only.
// Nunca se borra la fila físicamente: order_events tiene que seguir
// pudiendo referenciarla.

const SELECT_COLUMNS =
  "id, conversationId:conversation_id, advisorName:advisor_name, advisorEmail:advisor_email, " +
  "customerName:customer_name, customerPhone:customer_phone, customerCedula:customer_cedula, " +
  "state, city, address, paymentMethod:payment_method, " +
  "paymentMethodOther:payment_method_other, shippingInfo:shipping_info, trackingNumber:tracking_number, " +
  "captureUrl:capture_url, items, casheaOrderNumber:cashea_order_number, casheaTotalUsd:cashea_total_usd, " +
  "casheaInitialUsd:cashea_initial_usd, totalBs:total_bs, exchangeRate:exchange_rate, " +
  "totalUsd:total_usd, status, pendingRequest:pending_request, pendingRequestBy:pending_request_by, " +
  "pendingRequestAt:pending_request_at, createdAt:created_at"

const ORDER_STATUSES: OrderStatus[] = ["pendiente", "confirmado", "devuelto"]

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => null)
  const status = body && typeof body === "object" ? (body as Record<string, unknown>).status : null

  if (typeof status !== "string" || !ORDER_STATUSES.includes(status as OrderStatus)) {
    return NextResponse.json({ error: "estado_invalido" }, { status: 400 })
  }

  const actorEmail = request.headers.get(USER_EMAIL_HEADER)?.trim() || "admin"
  const eventType = status === "confirmado" ? "confirmacion_ejecutada" : status === "devuelto" ? "devolucion_ejecutada" : null

  const supabase = getSupabase()

  if (supabase) {
    const { data, error } = await supabase
      .from("orders")
      .update({ status, pending_request: null, pending_request_by: null, pending_request_at: null })
      .eq("id", id)
      .is("deleted_at", null)
      .select(SELECT_COLUMNS)
      .single()

    if (error) {
      return serverError("error_supabase", "orders: cambio de estado", error)
    }
    if (eventType) await addOrderEvent(id, eventType, actorEmail, actorEmail)
    return NextResponse.json(data)
  }

  const order = updateDemoOrderStatus(id, status as OrderStatus)
  if (!order) {
    return NextResponse.json({ error: "orden_no_encontrada" }, { status: 404 })
  }
  if (eventType) await addOrderEvent(id, eventType, actorEmail, actorEmail)
  return NextResponse.json(order)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const actorEmail = request.headers.get(USER_EMAIL_HEADER)?.trim() || "admin"

  const supabase = getSupabase()

  if (supabase) {
    const { data, error } = await supabase
      .from("orders")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle()

    if (error) {
      return serverError("error_supabase", "orders: eliminar", error)
    }
    if (!data) {
      return NextResponse.json({ error: "orden_no_encontrada" }, { status: 404 })
    }
    await addOrderEvent(id, "eliminada", actorEmail, actorEmail)
    return NextResponse.json({ ok: true })
  }

  const order = getOrder(id)
  if (!order || order.deletedAt !== null) {
    return NextResponse.json({ error: "orden_no_encontrada" }, { status: 404 })
  }
  softDeleteOrder(id)
  await addOrderEvent(id, "eliminada", actorEmail, actorEmail)
  return NextResponse.json({ ok: true })
}
