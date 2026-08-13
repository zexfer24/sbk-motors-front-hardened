import { NextResponse } from "next/server"
import { getSupabase } from "@/lib/supabase/client"
import { findLatestOrderByPhone } from "@/lib/api/orders-demo-store"

// Busca los datos del cliente (nombre, cédula, estado, ciudad, dirección)
// de su venta más reciente por número de teléfono, para prellenar "Cerrar
// venta" cuando ese mismo cliente vuelve a comprar — así el asesor no
// vuelve a escribir todo de cero.
//
// No es admin-only a propósito (a diferencia de GET /api/orders): cualquier
// asesor autenticado puede cerrar ventas, así que cualquiera necesita poder
// buscar el historial de un cliente por su teléfono en ese momento. Solo
// devuelve los campos de identidad del cliente, no el detalle financiero de
// sus compras anteriores.
export async function GET(request: Request) {
  const phone = new URL(request.url).searchParams.get("phone")?.trim()
  if (!phone) {
    return NextResponse.json({ error: "telefono_requerido" }, { status: 400 })
  }

  const supabase = getSupabase()

  if (supabase) {
    const { data, error } = await supabase
      .from("orders")
      .select("customer_name, customer_cedula, state, city, address")
      .eq("customer_phone", phone)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error(`[api] customers/lookup: consulta de orders: ${error.message}`)
      return NextResponse.json({ found: false })
    }
    if (!data) {
      return NextResponse.json({ found: false })
    }
    return NextResponse.json({
      found: true,
      customerName: data.customer_name,
      customerCedula: data.customer_cedula,
      state: data.state,
      city: data.city,
      address: data.address,
    })
  }

  const order = findLatestOrderByPhone(phone)
  if (!order) {
    return NextResponse.json({ found: false })
  }
  return NextResponse.json({
    found: true,
    customerName: order.customerName,
    customerCedula: order.customerCedula,
    state: order.state,
    city: order.city,
    address: order.address,
  })
}
