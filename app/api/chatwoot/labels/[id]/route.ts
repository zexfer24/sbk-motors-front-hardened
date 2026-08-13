import { NextResponse } from "next/server"
import { getChatwootConfig } from "@/lib/chatwoot/client"
import { deleteAccountLabel, slugifyLabelTitle, updateAccountLabel } from "@/lib/chatwoot/labels"

type RouteContext = { params: Promise<{ id: string }> }

const NUMERIC_ID = /^[0-9]{1,18}$/

// Editar una categoría — abierto a cualquier asesor autenticado (ver
// proxy.ts). Borrar (más abajo) sigue admin-only: es lo único
// destructivo/compartido de verdad (borra la etiqueta de TODOS los chats
// que la tengan puesta).
export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params
  if (!NUMERIC_ID.test(id)) {
    return NextResponse.json({ error: "id_invalido" }, { status: 400 })
  }
  if (!getChatwootConfig()) {
    return NextResponse.json({ error: "chatwoot_no_configurado" }, { status: 503 })
  }

  const body = await request.json().catch(() => null)
  const rawTitle = body && typeof body.title === "string" ? body.title.trim() : ""
  const color = body && typeof body.color === "string" ? body.color.trim() : ""
  if (!rawTitle) return NextResponse.json({ error: "titulo_requerido" }, { status: 400 })
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    return NextResponse.json({ error: "color_invalido" }, { status: 400 })
  }

  // Ver el comentario de slugifyLabelTitle en lib/chatwoot/labels.ts.
  const title = slugifyLabelTitle(rawTitle)
  if (title.length < 2) {
    return NextResponse.json({ error: "titulo_invalido" }, { status: 400 })
  }

  try {
    const label = await updateAccountLabel(Number(id), { title, color })
    return NextResponse.json(label)
  } catch {
    return NextResponse.json({ error: "error_chatwoot" }, { status: 502 })
  }
}

// Borrar — admin-only (reforzado en proxy.ts).
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params
  if (!NUMERIC_ID.test(id)) {
    return NextResponse.json({ error: "id_invalido" }, { status: 400 })
  }
  if (!getChatwootConfig()) {
    return NextResponse.json({ error: "chatwoot_no_configurado" }, { status: 503 })
  }

  try {
    await deleteAccountLabel(Number(id))
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "error_chatwoot" }, { status: 502 })
  }
}
