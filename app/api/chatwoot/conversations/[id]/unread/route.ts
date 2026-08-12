import { NextResponse } from "next/server"
import { markAsUnread } from "@/lib/api/chatwoot-demo-store"
import { chatwootFetch, getChatwootConfig } from "@/lib/chatwoot/client"
import { guardConversationRead } from "@/lib/chatwoot/authz"

type RouteContext = { params: Promise<{ id: string }> }

// Contraparte de app/api/chatwoot/conversations/[id]/read/route.ts — vuelve
// a marcar la conversación como no leída en Chatwoot de verdad (mismo
// motivo que esa ruta: si solo se marcara local, el contador real de
// Chatwoot la volvería a mostrar como leída en el próximo polling o
// recarga). Existe para poder devolver a mano un chat al tab "Sin
// contestar" — ver matchesStatus en components/chat/conversation-list.tsx.
//
// Es una acción de LECTURA en el mismo sentido que marcar-como-leído (no
// manda nada al cliente ni cambia quién tiene asignada la conversación),
// así que cualquiera del equipo puede usarla.
//
// Usa POST /conversations/:id/unread de la API de Chatwoot (la contraparte
// documentada de update_last_seen) — no confirmado contra un envío real
// todavía, mismo caveat que ya hay en otras integraciones nuevas de este
// archivo (ver content_attributes en .../messages/route.ts). Si el nombre
// del endpoint resultara distinto, este es el único lugar que hay que
// tocar.
export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params
  const denied = await guardConversationRead(request, id)
  if (denied) return denied

  const config = getChatwootConfig()

  if (config) {
    try {
      await chatwootFetch(`/conversations/${id}/unread`, { method: "POST" })
      return NextResponse.json({ ok: true })
    } catch {
      return NextResponse.json({ error: "error_chatwoot" }, { status: 502 })
    }
  }

  markAsUnread(id)
  return NextResponse.json({ ok: true })
}
