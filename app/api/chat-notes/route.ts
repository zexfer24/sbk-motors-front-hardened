import { NextResponse } from "next/server"
import { addNote, listNotes } from "@/lib/api/chat-notes-store"
import { USER_EMAIL_HEADER } from "@/lib/auth-headers"

// Notas privadas por cliente — cualquier asesor o admin autenticado puede
// leerlas y escribirlas (no es admin-only, ver proxy.ts: no está en la
// lista de rutas restringidas). Ver db/chat_notes_schema.sql.

function parseContactId(raw: string | null): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null
  return Number(raw)
}

export async function GET(request: Request) {
  const contactId = parseContactId(new URL(request.url).searchParams.get("contactId"))
  if (contactId === null) {
    return NextResponse.json({ error: "contacto_invalido" }, { status: 400 })
  }
  const notes = await listNotes(contactId)
  return NextResponse.json({ notes })
}

export async function POST(request: Request) {
  // El autor se toma de la SESIÓN, no del cuerpo — mismo criterio que
  // advisorName en app/api/orders/route.ts: lo que puede derivar el
  // servidor no se le pregunta al cliente.
  const authorEmail = request.headers.get(USER_EMAIL_HEADER)?.trim()
  if (!authorEmail) {
    return NextResponse.json({ error: "no_autenticado" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "cuerpo_invalido" }, { status: 400 })
  }

  const { contactId, content } = body as Record<string, unknown>
  if (typeof contactId !== "number" || !Number.isInteger(contactId) || contactId <= 0) {
    return NextResponse.json({ error: "contacto_invalido" }, { status: 400 })
  }
  if (typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json({ error: "contenido_requerido" }, { status: 400 })
  }

  const result = await addNote(contactId, authorEmail, content.trim())
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }
  return NextResponse.json(result, { status: 201 })
}
