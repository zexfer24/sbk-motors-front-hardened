import { NextResponse } from "next/server"
import { listConversations } from "@/lib/api/chatwoot-demo-store"
import { getChatwootConfig } from "@/lib/chatwoot/client"
import { fetchAndSyncConversations } from "@/lib/api/chatwoot-sync"
import { startWhatsappConversation } from "@/lib/chatwoot/new-conversation"
import { CHATWOOT_AGENT_ID_HEADER, USER_ROLE_HEADER } from "@/lib/auth-headers"
import { serverError } from "@/lib/api-errors"

export async function GET(request: Request) {
  const config = getChatwootConfig()

  // Todo el equipo ve TODOS los chats siempre (pedido del negocio: cobertura
  // y colaboración, cualquiera puede ver qué está pasando en cualquier
  // conversación). Lo que sí queda restringido es quién puede ESCRIBIR: se
  // deriva acá un `canWrite` por conversación — admin siempre, asesor solo
  // en la suya — para que la UI no reimplemente la regla (ver también
  // lib/chatwoot/authz.ts, que aplica la misma regla del lado servidor por
  // si alguien le pega directo a /messages saltándose la UI).
  const role = request.headers.get(USER_ROLE_HEADER)
  const agentIdHeader = request.headers.get(CHATWOOT_AGENT_ID_HEADER)
  const agentId =
    agentIdHeader && /^[0-9]{1,18}$/.test(agentIdHeader) ? Number(agentIdHeader) : null
  const canWrite = (assigneeId: number | null) =>
    role === "admin" || (agentId !== null && assigneeId === agentId)

  if (config) {
    const result = await fetchAndSyncConversations()
    if (!result.ok) {
      return NextResponse.json({ error: "error_chatwoot" }, { status: 502 })
    }

    const conversations = result.conversations.map((c) => ({
      ...c,
      canWrite: canWrite(c.assigneeId),
    }))

    // `partial: true` = alguna página del barrido falló y esto es lo que se
    // pudo traer (ver fetchAllConversationsRaw) — no se usa en la UI
    // todavía, pero queda visible en la respuesta en vez de escondido.
    return NextResponse.json({ conversations, source: "chatwoot", partial: result.partial })
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

  const { inboxId, phone, name, templateName, templateCategory, templateLanguage, bodyParams } =
    body as Record<string, unknown>

  if (typeof inboxId !== "number" || !Number.isInteger(inboxId) || inboxId <= 0) {
    return NextResponse.json({ error: "buzon_invalido" }, { status: 400 })
  }
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
      inboxId,
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
