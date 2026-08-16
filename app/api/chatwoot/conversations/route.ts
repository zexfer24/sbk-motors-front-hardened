import { NextResponse } from "next/server"
import { listConversations } from "@/lib/api/chatwoot-demo-store"
import { getChatwootConfig } from "@/lib/chatwoot/client"
import { fetchAndSyncConversations } from "@/lib/api/chatwoot-sync"
import { startWhatsappConversation } from "@/lib/chatwoot/new-conversation"
import { serverError } from "@/lib/api-errors"

export async function GET() {
  const config = getChatwootConfig()

  // Todo el equipo ve TODOS los chats siempre (pedido del negocio: cobertura
  // y colaboración, cualquiera puede ver qué está pasando en cualquier
  // conversación). 2026-08-16 (pedido explícito del negocio, ver
  // canWriteAssignee en lib/chatwoot/authz.ts): la escritura dejó de estar
  // restringida a quien tiene la conversación asignada — un incidente de
  // n8n reasignó chats a la persona equivocada y esa regla bloqueaba con
  // 403 al asesor real. `canWrite` se mantiene como campo (en vez de
  // borrarlo) para que la UI no tenga que cambiar de qué campo lee — ahora
  // simplemente siempre es `true` para cualquier autenticado, mismo
  // criterio que ya aplica lib/chatwoot/authz.ts del lado servidor por si
  // alguien le pega directo a /messages saltándose la UI.
  if (config) {
    const result = await fetchAndSyncConversations()
    if (!result.ok) {
      return NextResponse.json({ error: "error_chatwoot" }, { status: 502 })
    }

    const conversations = result.conversations.map((c) => ({
      ...c,
      canWrite: true,
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
