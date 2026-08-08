import { NextResponse } from "next/server"
import { serverError } from "@/lib/api-errors"
import { updateOrderStatus as updateDemoOrderStatus } from "@/lib/api/orders-demo-store"
import { getSupabase } from "@/lib/supabase/client"
import type { OrderStatus } from "@/lib/types/order"

// PATCH /api/orders/:id — solo cambia el estado (Confirmar/Devolución en
// Ventas). Sin efectos secundarios todavía: no toca inventario ni Chatwoot.

const SELECT_COLUMNS =
  "id, conversationId:conversation_id, advisorName:advisor_name, customerName:customer_name, " +
  "customerPhone:customer_phone, customerCedula:customer_cedula, state, city, address, " +
  "paymentMethod:payment_method, " +
  "paymentMethodOther:payment_method_other, shippingInfo:shipping_info, captureUrl:capture_url, " +
  "items, casheaOrderNumber:cashea_order_number, casheaTotalUsd:cashea_total_usd, " +
  "casheaInitialUsd:cashea_initial_usd, totalBs:total_bs, exchangeRate:exchange_rate, " +
  "totalUsd:total_usd, status, createdAt:created_at"

const ORDER_STATUSES: OrderStatus[] = ["pendiente", "confirmado", "devuelto"]

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json().catch(() => null)
  const status = body && typeof body === "object" ? (body as Record<string, unknown>).status : null

  if (typeof status !== "string" || !ORDER_STATUSES.includes(status as OrderStatus)) {
    return NextResponse.json({ error: "estado_invalido" }, { status: 400 })
  }

  const supabase = getSupabase()

  if (supabase) {
    const { data, error } = await supabase
      .from("orders")
      .update({ status })
      .eq("id", id)
      .select(SELECT_COLUMNS)
      .single()

    if (error) {
      return serverError("error_supabase", "orders: cambio de estado", error)
    }
    return NextResponse.json(data)
  }

  const order = updateDemoOrderStatus(id, status as OrderStatus)
  if (!order) {
    return NextResponse.json({ error: "orden_no_encontrada" }, { status: 404 })
  }
  return NextResponse.json(order)
}
