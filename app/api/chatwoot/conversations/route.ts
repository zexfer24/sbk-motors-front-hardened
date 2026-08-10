import { NextResponse } from "next/server"
import { listConversations } from "@/lib/api/chatwoot-demo-store"
import { getChatwootConfig } from "@/lib/chatwoot/client"
import { fetchAndSyncConversations } from "@/lib/api/chatwoot-sync"
import { startWhatsappConversation } from "@/lib/chatwoot/new-conversation"
import { CHATWOOT_AGENT_ID_HEADER, USER_ROLE_HEADER } from "@/lib/auth-headers"
import { serverError } from "@/lib/api-errors"

export async function GET(request: Request) {
  const config = getChatwootConfig()

  if (config) {
    const result = await fetchAndSyncConversations()
    if (!result.ok) {
      return NextResponse.json({ error: "error_chatwoot" }, { status: 502 })
    }

    // Un asesor solo necesita ver sus propios chats y los que todavía no
    // tienen dueño (para poder tomarlos) — no los de sus compañeros. Los
    // admin (dueños/supervisor) siguen viendo todo, como antes.
    //
    // Falla CERRADO: antes la condición era `role === "asesor" && agentId
    // !== null`, así que un asesor sin `chatwoot_agent_id` vinculado caía al
    // `else` y veía TODAS las conversaciones de la empresa. Ahora solo se
    // ensancha la vista para admin; cualquier otro caso filtra, y un asesor
    // sin agente vinculado ve únicamente las no asignadas.
    const role = request.headers.get(USER_ROLE_HEADER)
    const agentIdHeader = request.headers.get(CHATWOOT_AGENT_ID_HEADER)
    const agentId =
      agentIdHeader && /^[0-9]{1,18}$/.test(agentIdHeader) ? Number(agentIdHeader) : null

    const conversations =
      role === "admin"
        ? result.conversations
        : result.conversations.filter(
            (c) => c.assigneeId === null || (agentId !== null && c.assigneeId === agentId),
          )

    return NextResponse.json({ conversations, source: "chatwoot" })
  }

  return NextResponse.json({ conversations: listConversations(), source: "demo" })
}

// Inicia un chat nuevo (contacto nuevo o número nuevo) mandando una
// plantilla preaprobada de WhatsApp — ver lib/chatwoot/new-conversation.ts.
// No aplica en modo demo: sin Chatwoot configurado no hay a quién mandarle
// nada de verdad. No es admin-only: cualquier asesor autenticado puede
// iniciar chats, igual que puede cerrarlos.
export async function POST(request: Request) {
  if (!getChatwootConfig()) {
    return NextResponse.json({ error: "chatwoot_no_configurado" }, { status: 503 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "cuerpo_invalido" }, { status: 400 })
  }

  const { phone, name, templateName, templateCategory, templateLanguage, bodyParams } =
    body as Record<string, unknown>

  if (typeof phone !== "string" || !/^\+\d{8,15}$/.test(phone)) {
    return NextResponse.json({ error: "telefono_invalido" }, { status: 400 })
  }
  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "nombre_requerido" }, { status: 400 })
  }
  if (typeof templateName !== "string" || templateName.trim().length === 0) {
    return NextResponse.json({ error: "plantilla_requerida" }, { status: 400 })
  }
  if (typeof templateCategory !== "string" || templateCategory.trim().length === 0) {
    return NextResponse.json({ error: "categoria_requerida" }, { status: 400 })
  }
  if (typeof templateLanguage !== "string" || templateLanguage.trim().length === 0) {
    return NextResponse.json({ error: "idioma_requerido" }, { status: 400 })
  }
  if (!Array.isArray(bodyParams) || !bodyParams.every((p) => typeof p === "string")) {
    return NextResponse.json({ error: "parametros_invalidos" }, { status: 400 })
  }

  try {
    const result = await startWhatsappConversation({
      phone,
      name: name.trim(),
      templateName: templateName.trim(),
      templateCategory: templateCategory.trim(),
      templateLanguage: templateLanguage.trim(),
      bodyParams,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    return serverError("error_chatwoot", "chatwoot/conversations: iniciar chat nuevo", err, 502)
  }
}
