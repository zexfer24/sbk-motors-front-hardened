import { NextResponse } from "next/server"
import { deleteQuickReply, updateQuickReply } from "@/lib/api/quick-replies-demo-store"
import { getSupabase } from "@/lib/supabase/client"
import { serverError } from "@/lib/api-errors"

const SELECT_COLUMNS = "id, label, content"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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
      .update(input)
      .eq("id", id)
      .select(SELECT_COLUMNS)
      .maybeSingle()

    if (error) {
      return serverError("error_supabase", "quick-replies: editar", error)
    }
    if (!data) {
      return NextResponse.json({ error: "no_encontrado" }, { status: 404 })
    }
    return NextResponse.json(data)
  }

  const updated = updateQuickReply(id, input)
  if (!updated) {
    return NextResponse.json({ error: "no_encontrado" }, { status: 404 })
  }
  return NextResponse.json(updated)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = getSupabase()

  if (supabase) {
    const { error } = await supabase.from("quick_replies").delete().eq("id", id)
    if (error) {
      return serverError("error_supabase", "quick-replies: borrar", error)
    }
    return NextResponse.json({ ok: true })
  }

  const deleted = deleteQuickReply(id)
  if (!deleted) {
    return NextResponse.json({ error: "no_encontrado" }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
