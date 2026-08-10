import { NextResponse } from "next/server"
import { getChatwootConfig } from "@/lib/chatwoot/client"
import { getWhatsappTemplates } from "@/lib/chatwoot/new-conversation"
import { serverError } from "@/lib/api-errors"

// Plantillas aprobadas por Meta para iniciar chats fuera de la ventana de
// 24h — cualquier asesor las puede pedir, las necesita para "Nuevo chat".
export async function GET() {
  if (!getChatwootConfig()) {
    return NextResponse.json({ templates: [] })
  }

  try {
    const templates = await getWhatsappTemplates()
    return NextResponse.json({ templates })
  } catch (err) {
    return serverError("error_chatwoot", "chatwoot/templates: listar plantillas", err, 502)
  }
}
