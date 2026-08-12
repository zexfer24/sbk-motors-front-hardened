import { NextResponse } from "next/server"
import { deleteMessage } from "@/lib/api/chatwoot-demo-store"
import { chatwootFetch, getChatwootConfig } from "@/lib/chatwoot/client"
import { guardConversationWrite } from "@/lib/chatwoot/authz"

type RouteContext = { params: Promise<{ id: string; messageId: string }> }

const NUMERIC_ID = /^[0-9]{1,18}$/

// Editar un mensaje ya mandado no es viable: ni Chatwoot ni la propia API de
// WhatsApp lo soportan hoy (WhatsApp no deja modificar lo que el cliente ya
// recibió). Borrar sí — pero ojo, esto borra el mensaje de ESTE panel/de
// Chatwoot, no lo "retira" del teléfono del cliente: si ya lo vio en
// WhatsApp, lo sigue viendo ahí (Meta no expone un borrado remoto vía la
// Cloud API). Ese aviso se muestra en el propio front antes de confirmar.
export async function DELETE(request: Request, { params }: RouteContext) {
  const { id, messageId } = await params
  // Mismo perímetro que mandar un mensaje — admin o quien tiene la
  // conversación asignada — para que no cualquiera borre el mensaje de un
  // compañero.
  const denied = await guardConversationWrite(request, id)
  if (denied) return denied

  if (!NUMERIC_ID.test(messageId)) {
    return NextResponse.json({ error: "id_invalido" }, { status: 400 })
  }

  const config = getChatwootConfig()

  if (config) {
    try {
      await chatwootFetch(`/conversations/${id}/messages/${messageId}`, { method: "DELETE" })
      return NextResponse.json({ ok: true })
    } catch {
      return NextResponse.json({ error: "error_chatwoot" }, { status: 502 })
    }
  }

  const ok = deleteMessage(id, messageId)
  if (!ok) {
    return NextResponse.json({ error: "no_encontrado" }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
