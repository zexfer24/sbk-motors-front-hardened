import { NextResponse } from "next/server"
import { getChatwootConfig } from "@/lib/chatwoot/client"
import { getWhatsappInboxesWithTemplates } from "@/lib/chatwoot/new-conversation"
import { serverError } from "@/lib/api-errors"

// Plantillas aprobadas por Meta para iniciar chats fuera de la ventana de
// 24h — cualquier asesor las puede pedir, las necesita para "Nuevo chat".
// Se agrupan por buzón porque cada número de WhatsApp tiene su propio set
// de plantillas aprobadas (no se comparten entre buzones).
export async function GET() {
  if (!getChatwootConfig()) {
    return NextResponse.json({ inboxes: [] })
  }

  try {
    const inboxes = await getWhatsappInboxesWithTemplates()
    return NextResponse.json({ inboxes })
  } catch (err) {
    return serverError("error_chatwoot", "chatwoot/templates: listar plantillas", err, 502)
  }
}
