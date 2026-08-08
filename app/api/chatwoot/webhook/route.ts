// ============================================================================
// Webhook de Chatwoot — reemplaza el polling cada 5-6s por un aviso real.
// ============================================================================
// Chatwoot llama esta URL cada vez que pasa algo (mensaje nuevo, cambio de
// estado, reasignación). Este endpoint solo traduce ese evento a un aviso
// interno (event-bus) que las conexiones SSE (/api/chatwoot/events) reenvían
// a los navegadores conectados — así el front se entera al instante en vez
// de tener que preguntar "¿algo nuevo?" varias veces por minuto.
//
// Es una ruta PÚBLICA (ver proxy.ts, PUBLIC_API_PATHS): Chatwoot no manda la
// cookie de sesión de nadie, así que no hay nada que resolveSession() pueda
// verificar. En su lugar se protege con un secreto compartido en la propia
// URL (?token=...), comparado en tiempo constante. Sin ese secreto
// configurado, se rechaza TODO — falla cerrado, igual que el resto del
// sistema cuando falta una variable de entorno crítica.
// ============================================================================

import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { publishChatwootEvent } from "@/lib/chatwoot/event-bus"
import { checkRateLimit, clientIp } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

const MESSAGE_EVENTS = new Set(["message_created", "message_updated"])
const CONVERSATION_EVENTS = new Set([
  "conversation_created",
  "conversation_updated",
  "conversation_status_changed",
])

// No usa === directo: compararía tiempos distintos según en qué carácter
// difieran, lo que en teoría filtra el secreto byte a byte. No es la parte
// más sensible del sistema, pero es gratis hacerlo bien.
function isValidToken(received: string, expected: string): boolean {
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(request: Request) {
  const expected = process.env.CHATWOOT_WEBHOOK_SECRET
  if (!expected) {
    return NextResponse.json({ error: "webhook_no_configurado" }, { status: 503 })
  }

  // Sin sesión que limitar por correo, solo queda la IP — pero como Chatwoot
  // siempre llama desde la misma instancia, un techo generoso basta para
  // frenar abuso sin arriesgar tráfico legítimo en ráfaga.
  const ip = clientIp(request)
  const limit = checkRateLimit(`chatwoot-webhook:${ip}`, 120, 60_000)
  if (!limit.ok) {
    return NextResponse.json(
      { error: "demasiadas_solicitudes" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    )
  }

  const token = new URL(request.url).searchParams.get("token") ?? ""
  if (!isValidToken(token, expected)) {
    return NextResponse.json({ error: "token_invalido" }, { status: 401 })
  }

  let payload: Record<string, unknown>
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "payload_invalido" }, { status: 400 })
  }

  const event = String(payload.event ?? "")

  if (MESSAGE_EVENTS.has(event)) {
    const conversation = payload.conversation as Record<string, unknown> | undefined
    const conversationId = conversation?.id != null ? String(conversation.id) : null
    publishChatwootEvent({ type: "message_changed", conversationId })
  } else if (CONVERSATION_EVENTS.has(event)) {
    const conversationId = payload.id != null ? String(payload.id) : null
    publishChatwootEvent({ type: "conversation_changed", conversationId })
  }
  // Otros eventos (contact_created, webwidget_triggered, etc.) no afectan
  // ni al listado ni a los mensajes visibles en el panel — se ignoran.

  return NextResponse.json({ ok: true })
}
