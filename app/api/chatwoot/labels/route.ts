import { NextResponse } from "next/server"
import { getChatwootConfig } from "@/lib/chatwoot/client"
import { createAccountLabel, listAccountLabels, slugifyLabelTitle } from "@/lib/chatwoot/labels"

// GET: catálogo completo de categorías — cualquier autenticado (lo necesita
// todo el equipo para ver/filtrar por etiqueta). POST: crear una categoría
// nueva — también abierto a cualquier asesor (solo borrar/editar el
// catálogo tenía sentido restringir más, y editar ahora también se abrió,
// ver labels/[id]/route.ts). Solo BORRAR sigue admin-only.
export async function GET() {
  if (!getChatwootConfig()) {
    return NextResponse.json({ labels: [] })
  }
  try {
    const labels = await listAccountLabels()
    return NextResponse.json({ labels })
  } catch {
    return NextResponse.json({ error: "error_chatwoot" }, { status: 502 })
  }
}

// Crear una categoría nueva — abierto a cualquier autenticado (ver
// proxy.ts); solo borrar sigue admin-only (app/api/chatwoot/labels/[id]).
export async function POST(request: Request) {
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

  // Ver el comentario de slugifyLabelTitle — Chatwoot rechaza espacios de
  // raíz, así que se limpia acá en vez de dejar que truene con un 400.
  const title = slugifyLabelTitle(rawTitle)
  if (title.length < 2) {
    return NextResponse.json({ error: "titulo_invalido" }, { status: 400 })
  }

  try {
    const label = await createAccountLabel({ title, color })
    return NextResponse.json(label, { status: 201 })
  } catch {
    return NextResponse.json({ error: "error_chatwoot" }, { status: 502 })
  }
}
