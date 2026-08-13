import { NextResponse } from "next/server"
import { serverError } from "@/lib/api-errors"
import { createOrder, listOrders } from "@/lib/api/orders-demo-store"
import { addOrderEvent } from "@/lib/api/order-events-store"
import { getSupabase } from "@/lib/supabase/client"
import { getTodayRate } from "@/lib/bcv-rate"
import { computeCasheaTotalUsd, computeOrderTotals } from "@/lib/order-totals"
import { caracasDayBoundsUtc, isValidDateStr } from "@/lib/caracas-time"
import { SELECTABLE_PAYMENT_METHODS } from "@/lib/types/order"
import type { OrderItem, PaymentMethod } from "@/lib/types/order"
import { USER_EMAIL_HEADER, USER_ROLE_HEADER } from "@/lib/auth-headers"
import { authorizeConversationWrite } from "@/lib/chatwoot/authz"
import { chatwootFetch, getChatwootConfig } from "@/lib/chatwoot/client"

// Único punto de entrada que el navegador conoce (/api/orders). Habla
// directo con Supabase (tabla orders) si las credenciales están
// configuradas; si no, usa el store en memoria (vacío, sin datos mock).
// Ver db/orders_schema.sql.
//
// Solo lectura y alta — no hay edición desde el front (el borrado es lógico,
// ver DELETE en app/api/orders/[id]/route.ts). Las ventas solo se crean
// desde el flujo de "Cerrar venta" en el chat.
//
// LECTURA ya no es admin-only (antes lo era, ver proxy.ts): un asesor ve
// únicamente sus propias ventas (advisor_email = su sesión), sin filtro de
// fecha; el admin ve todas y puede acotar por rango de fechas (?from=&to=,
// YYYY-MM-DD, calendario de Caracas).

const SELECT_COLUMNS =
  "id, conversationId:conversation_id, advisorName:advisor_name, advisorEmail:advisor_email, " +
  "customerName:customer_name, customerPhone:customer_phone, customerCedula:customer_cedula, " +
  "state, city, address, paymentMethod:payment_method, paymentMethodOther:payment_method_other, " +
  "shippingInfo:shipping_info, trackingNumber:tracking_number, captureUrl:capture_url, " +
  "items, casheaOrderNumber:cashea_order_number, casheaTotalUsd:cashea_total_usd, " +
  "casheaInitialUsd:cashea_initial_usd, totalBs:total_bs, exchangeRate:exchange_rate, " +
  "totalUsd:total_usd, status, pendingRequest:pending_request, pendingRequestBy:pending_request_by, " +
  "pendingRequestAt:pending_request_at, createdAt:created_at"

export async function GET(request: Request) {
  const isAdmin = request.headers.get(USER_ROLE_HEADER) === "admin"
  const email = request.headers.get(USER_EMAIL_HEADER)?.trim() ?? ""
  const { searchParams } = new URL(request.url)
  const from = searchParams.get("from")
  const to = searchParams.get("to")

  const supabase = getSupabase()

  if (supabase) {
    let query = supabase
      .from("orders")
      .select(SELECT_COLUMNS)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })

    if (!isAdmin) {
      query = query.eq("advisor_email", email)
    } else {
      if (from && isValidDateStr(from)) query = query.gte("created_at", caracasDayBoundsUtc(from).startUtc)
      if (to && isValidDateStr(to)) query = query.lt("created_at", caracasDayBoundsUtc(to).endUtc)
    }

    const { data, error } = await query
    if (error) {
      return serverError("error_supabase", "orders", error)
    }
    return NextResponse.json({ orders: data, source: "supabase" })
  }

  return NextResponse.json({
    orders: listOrders(isAdmin ? undefined : { advisorEmail: email }),
    source: "demo",
  })
}

function isValidItems(items: unknown): items is OrderItem[] {
  if (!Array.isArray(items) || items.length === 0) return false
  return items.every((raw) => {
    if (!raw || typeof raw !== "object") return false
    const it = raw as Record<string, unknown>
    return (
      typeof it.sku === "string" &&
      typeof it.name === "string" &&
      typeof it.price === "number" &&
      it.price >= 0 &&
      typeof it.quantity === "number" &&
      it.quantity > 0
    )
  })
}

// Best-effort: si el nombre del cliente cambió respecto al contacto real de
// Chatwoot, se sincroniza allá también. Nunca bloquea ni revierte la venta
// (ya se guardó) si esto falla — un contacto desincronizado es mucho menos
// grave que perder o duplicar una venta ya cerrada.
async function syncContactNameToChatwoot(conversationId: string, customerName: string): Promise<void> {
  if (!getChatwootConfig()) return
  try {
    const raw = await chatwootFetch<Record<string, unknown>>(`/conversations/${conversationId}`, {
      cache: "no-store",
    })
    const meta = (raw.meta as Record<string, unknown>) ?? {}
    const sender = meta.sender as Record<string, unknown> | null | undefined
    const contactId = sender && sender.id != null ? Number(sender.id) : null
    const currentName = sender && typeof sender.name === "string" ? sender.name : null
    if (contactId == null || currentName === null || currentName === customerName) return

    await chatwootFetch(`/contacts/${contactId}`, {
      method: "PATCH",
      body: JSON.stringify({ name: customerName }),
    })
  } catch (err) {
    console.error("[api] orders: no se pudo sincronizar el nombre del contacto en Chatwoot", err)
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "cuerpo_invalido" }, { status: 400 })
  }

  // El nombre del asesor se toma de la SESIÓN, no del cuerpo de la petición.
  // Antes se aceptaba lo que mandara el cliente sin compararlo con quién
  // estaba logueado, así que un asesor podía registrar una venta a nombre de
  // otro — y `orders` alimenta los KPIs del Panel y el reporte de Ventas.
  // Mismo criterio que ya se aplica a los totales monetarios: lo que puede
  // derivar el servidor, no se le pregunta al cliente.
  const sessionEmail = request.headers.get(USER_EMAIL_HEADER)?.trim()
  if (!sessionEmail) {
    return NextResponse.json({ error: "no_autenticado" }, { status: 401 })
  }

  const {
    conversationId,
    customerName,
    customerPhone,
    customerCedula,
    state,
    city,
    address,
    paymentMethod,
    paymentMethodOther,
    shippingInfo,
    trackingNumber,
    captureUrl,
    items,
    casheaOrderNumber,
    casheaInitialUsd,
  } = body as Record<string, unknown>

  if (typeof conversationId !== "string" || conversationId.trim().length === 0) {
    return NextResponse.json({ error: "conversacion_requerida" }, { status: 400 })
  }
  // Autorización sobre la conversación: cerrar una venta colgada del chat de
  // otro asesor era posible con solo cambiar `conversationId`.
  const authz = await authorizeConversationWrite(request, conversationId.trim())
  if (!authz.ok) return authz.response

  // El nombre del asesor lo deriva el servidor del asignado en Chatwoot —
  // que es exactamente de donde lo leía el front (conversation.assigneeName,
  // ver components/chat/close-sale-modal.tsx), así que el valor que aparece
  // en Ventas no cambia; simplemente ya no es falseable desde el cliente.
  const advisorName = authz.assignee?.assigneeName?.trim() || sessionEmail
  if (typeof customerName !== "string" || customerName.trim().length === 0) {
    return NextResponse.json({ error: "nombre_requerido" }, { status: 400 })
  }
  if (typeof customerPhone !== "string" || customerPhone.trim().length === 0) {
    return NextResponse.json({ error: "telefono_requerido" }, { status: 400 })
  }
  if (typeof customerCedula !== "string" || customerCedula.length === 0) {
    return NextResponse.json({ error: "cedula_requerida" }, { status: 400 })
  }
  if (!/^\d+$/.test(customerCedula)) {
    return NextResponse.json({ error: "cedula_invalida" }, { status: 400 })
  }
  if (typeof state !== "string" || state.trim().length === 0) {
    return NextResponse.json({ error: "estado_requerido" }, { status: 400 })
  }
  if (typeof city !== "string" || city.trim().length === 0) {
    return NextResponse.json({ error: "ciudad_requerida" }, { status: 400 })
  }
  if (typeof address !== "string" || address.trim().length === 0) {
    return NextResponse.json({ error: "direccion_requerida" }, { status: 400 })
  }
  if (typeof paymentMethod !== "string" || !SELECTABLE_PAYMENT_METHODS.includes(paymentMethod as PaymentMethod)) {
    return NextResponse.json({ error: "metodo_pago_invalido" }, { status: 400 })
  }
  if (paymentMethodOther !== null && typeof paymentMethodOther !== "string") {
    return NextResponse.json({ error: "metodo_pago_otro_invalido" }, { status: 400 })
  }
  if (typeof shippingInfo !== "string") {
    return NextResponse.json({ error: "envio_invalido" }, { status: 400 })
  }
  if (trackingNumber !== null && trackingNumber !== undefined && typeof trackingNumber !== "string") {
    return NextResponse.json({ error: "numero_guia_invalido" }, { status: 400 })
  }
  if (captureUrl !== null && typeof captureUrl !== "string") {
    return NextResponse.json({ error: "captura_invalida" }, { status: 400 })
  }
  if (!isValidItems(items)) {
    return NextResponse.json({ error: "articulos_invalidos" }, { status: 400 })
  }

  let exchangeRate: number
  try {
    exchangeRate = (await getTodayRate()).rate
  } catch (err) {
    return serverError("error_tasa_bcv", "orders", err, 502)
  }

  const isCashea = paymentMethod === "cashea"
  let casheaOrderNumberClean: string | null = null
  let casheaTotalUsdClean: number | null = null
  let casheaInitialUsdClean: number | null = null

  if (isCashea) {
    if (typeof casheaOrderNumber !== "string" || casheaOrderNumber.trim().length === 0) {
      return NextResponse.json({ error: "cashea_orden_requerida" }, { status: 400 })
    }
    // El monto total de la orden lo calcula el sistema a partir del
    // carrito — no se confía en lo que mande el cliente (ver
    // lib/order-totals.ts), aunque llegue en casheaTotalUsd.
    const computedTotal = computeCasheaTotalUsd(items, exchangeRate)
    if (!(computedTotal > 0)) {
      return NextResponse.json({ error: "cashea_monto_total_invalido" }, { status: 400 })
    }
    if (typeof casheaInitialUsd !== "number" || !(casheaInitialUsd > 0)) {
      return NextResponse.json({ error: "cashea_monto_inicial_invalido" }, { status: 400 })
    }
    if (casheaInitialUsd > computedTotal) {
      return NextResponse.json({ error: "cashea_inicial_mayor_al_real" }, { status: 400 })
    }
    casheaOrderNumberClean = casheaOrderNumber.trim()
    casheaTotalUsdClean = computedTotal
    casheaInitialUsdClean = casheaInitialUsd
  }

  const { totalBs, totalUsd } = computeOrderTotals({
    items,
    exchangeRate,
    isCashea,
    casheaInitialUsd: casheaInitialUsdClean,
  })

  const input = {
    conversationId: conversationId.trim(),
    advisorName,
    advisorEmail: sessionEmail,
    customerName: customerName.trim(),
    customerPhone: customerPhone.trim(),
    customerCedula,
    state: state.trim(),
    city: city.trim(),
    address: address.trim(),
    paymentMethod: paymentMethod as PaymentMethod,
    paymentMethodOther: paymentMethodOther ? (paymentMethodOther as string).trim() : null,
    shippingInfo: shippingInfo.trim(),
    trackingNumber: typeof trackingNumber === "string" && trackingNumber.trim() ? trackingNumber.trim() : null,
    captureUrl: captureUrl as string | null,
    items,
    casheaOrderNumber: casheaOrderNumberClean,
    casheaTotalUsd: casheaTotalUsdClean,
    casheaInitialUsd: casheaInitialUsdClean,
    totalBs,
    exchangeRate,
    totalUsd,
    status: "pendiente" as const,
  }

  const supabase = getSupabase()
  let orderId: string
  let responseBody: unknown

  if (supabase) {
    const { data, error } = await supabase
      .from("orders")
      .insert({
        conversation_id: input.conversationId,
        advisor_name: input.advisorName,
        advisor_email: input.advisorEmail,
        customer_name: input.customerName,
        customer_phone: input.customerPhone,
        customer_cedula: input.customerCedula,
        state: input.state,
        city: input.city,
        address: input.address,
        payment_method: input.paymentMethod,
        payment_method_other: input.paymentMethodOther,
        shipping_info: input.shippingInfo,
        tracking_number: input.trackingNumber,
        capture_url: input.captureUrl,
        items: input.items,
        cashea_order_number: input.casheaOrderNumber,
        cashea_total_usd: input.casheaTotalUsd,
        cashea_initial_usd: input.casheaInitialUsd,
        total_bs: input.totalBs,
        exchange_rate: input.exchangeRate,
        total_usd: input.totalUsd,
        status: input.status,
      })
      .select(SELECT_COLUMNS)
      .single()

    if (error) {
      return serverError("error_supabase", "orders", error)
    }
    orderId = String((data as unknown as { id: string }).id)
    responseBody = data
  } else {
    const order = createOrder(input)
    orderId = order.id
    responseBody = order
  }

  await addOrderEvent(orderId, "cierre", sessionEmail, advisorName)
  await syncContactNameToChatwoot(input.conversationId, input.customerName)

  return NextResponse.json(responseBody, { status: 201 })
}
