import { NextResponse } from "next/server"
import { deleteNote, updateNote } from "@/lib/api/chat-notes-store"
import { USER_EMAIL_HEADER } from "@/lib/auth-headers"

// PATCH/DELETE /api/chat-notes/:id — solo el autor de la nota puede editarla
// o borrarla (pedido explícito del negocio, revierte la regla anterior de
// "nunca se reinicien"). No es admin-only, ver proxy.ts: cualquier asesor o
// admin autenticado puede tocar sus PROPIAS notas.

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authorEmail = request.headers.get(USER_EMAIL_HEADER)?.trim()
  if (!authorEmail) {
    return NextResponse.json({ error: "no_autenticado" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const content = body && typeof body === "object" ? (body as Record<string, unknown>).content : null
  if (typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json({ error: "contenido_requerido" }, { status: 400 })
  }

  const result = await updateNote(id, authorEmail, content.trim())
  if ("error" in result) {
    const status = result.error === "no_encontrada" ? 404 : 502
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json(result)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authorEmail = request.headers.get(USER_EMAIL_HEADER)?.trim()
  if (!authorEmail) {
    return NextResponse.json({ error: "no_autenticado" }, { status: 401 })
  }

  const result = await deleteNote(id, authorEmail)
  if ("error" in result) {
    const status = result.error === "no_encontrada" ? 404 : 502
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json(result)
}
