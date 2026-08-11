import { NextResponse } from "next/server"
import { getChatwootConfig } from "@/lib/chatwoot/client"
import { createAccountLabel, listAccountLabels } from "@/lib/chatwoot/labels"

// GET: catálogo completo de categorías — cualquier autenticado (lo necesita
// todo el equipo para ver/filtrar por etiqueta). POST: crear una categoría
// nueva — admin-only, reforzado en proxy.ts (mismo patrón que quick-replies).
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

export async function POST(request: Request) {
  if (!getChatwootConfig()) {
    return NextResponse.json({ error: "chatwoot_no_configurado" }, { status: 503 })
  }

  const body = await request.json().catch(() => null)
  const title = body && typeof body.title === "string" ? body.title.trim() : ""
  const color = body && typeof body.color === "string" ? body.color.trim() : ""
  if (!title) return NextResponse.json({ error: "titulo_requerido" }, { status: 400 })
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    return NextResponse.json({ error: "color_invalido" }, { status: 400 })
  }

  try {
    const label = await createAccountLabel({ title, color })
    return NextResponse.json(label, { status: 201 })
  } catch {
    return NextResponse.json({ error: "error_chatwoot" }, { status: 502 })
  }
}
