import { NextResponse } from "next/server"
import { createQuickReply, listQuickReplies } from "@/lib/api/quick-replies-demo-store"
import { getSupabase } from "@/lib/supabase/client"
import { serverError } from "@/lib/api-errors"

// Respuestas rápidas del chat — GET lo puede pedir cualquier asesor
// autenticado (las necesita para usarlas), pero crear una nueva es
// admin-only (ver proxy.ts): son contenido compartido por toda la empresa,
// no algo que cada asesor deba poder alterar por su cuenta.

const SELECT_COLUMNS = "id, label, content"

export async function GET() {
  const supabase = getSupabase()

  if (supabase) {
    const { data, error } = await supabase
      .from("quick_replies")
      .select(SELECT_COLUMNS)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })

    if (error) {
      return serverError("error_supabase", "quick-replies: listar", error)
    }
    return NextResponse.json({ replies: data })
  }

  return NextResponse.json({ replies: listQuickReplies() })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "cuerpo_invalido" }, { status: 400 })
  }

  const { label, content } = body as Record<string, unknown>
  if (typeof label !== "string" || label.trim().length === 0) {
    return NextResponse.json({ error: "etiqueta_requerida" }, { status: 400 })
  }
  if (typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json({ error: "contenido_requerido" }, { status: 400 })
  }

  const input = { label: label.trim(), content: content.trim() }
  const supabase = getSupabase()

  if (supabase) {
    const { data, error } = await supabase
      .from("quick_replies")
      .insert(input)
      .select(SELECT_COLUMNS)
      .single()

    if (error) {
      return serverError("error_supabase", "quick-replies: crear", error)
    }
    return NextResponse.json(data, { status: 201 })
  }

  return NextResponse.json(createQuickReply(input), { status: 201 })
}
