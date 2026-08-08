import { NextResponse } from "next/server"
import { serverError } from "@/lib/api-errors"
import { listItems } from "@/lib/api/inventory-demo-store"
import { getSupabase } from "@/lib/supabase/client"

// Único punto de entrada que el navegador conoce (/api/inventory). Habla
// directo con Supabase (tabla `saprod` — la misma que usa la IA para
// responder por WhatsApp) si las credenciales están configuradas, o usa
// el store en memoria (vacío, sin datos mock) si no. Ver
// db/SUPABASE_CONNECTION.md.
//
// Es de SOLO LECTURA a propósito — `saprod` es la fuente de verdad que
// también consulta el agente de IA, así que este front nunca debe poder
// crear, editar ni borrar filas ahí. No hay POST.

const SELECT_COLUMNS = "id:codprod, sku:codprod, name:descrip, price:precio3, stock:existen"
const PAGE_SIZE = 50

export async function GET(request: Request) {
  const url = new URL(request.url)
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1)
  const q = (url.searchParams.get("q") ?? "").trim()
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const supabase = getSupabase()

  if (supabase) {
    let query = supabase.from("saprod").select(SELECT_COLUMNS, { count: "exact" })

    if (q) {
      // El escapado anterior solo cubría los comodines de LIKE (% y _), no
      // los metacaracteres de la gramática de PostgREST: en un `or=` la coma
      // separa condiciones y los paréntesis agrupan. Una `q` con comas
      // inyectaba condiciones extra sobre columnas no previstas de `saprod`.
      //
      // Ahora se descartan esos caracteres antes de construir el filtro. No
      // es SQL injection (PostgREST parametriza contra Postgres), pero sí
      // inyección en la capa de filtros — y con los mensajes de error
      // silenciados servía para enumerar el esquema por prueba y error.
      const sanitized = q.replace(/[(),."'\\:*]/g, " ").replace(/\s+/g, " ").trim()
      const escaped = sanitized.replace(/[%_]/g, (c) => `\\${c}`)
      if (escaped) {
        query = query.or(`descrip.ilike.%${escaped}%,codprod.ilike.%${escaped}%`)
      }
    }

    const { data, error, count } = await query
      .order("descrip", { ascending: true })
      .range(from, to)

    if (error) {
      return serverError("error_supabase", "inventory: consulta a saprod", error)
    }

    const totalCount = count ?? 0
    return NextResponse.json({
      items: data,
      source: "supabase",
      page,
      pageSize: PAGE_SIZE,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
    })
  }

  const qLower = q.toLowerCase()
  const all = qLower
    ? listItems().filter(
        (item) =>
          item.name.toLowerCase().includes(qLower) || item.sku.toLowerCase().includes(qLower),
      )
    : listItems()

  const totalCount = all.length
  return NextResponse.json({
    items: all.slice(from, to + 1),
    source: "demo",
    page,
    pageSize: PAGE_SIZE,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
  })
}
