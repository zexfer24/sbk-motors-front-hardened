import { NextResponse } from "next/server"
import { getConversation, addMessage } from "@/lib/api/chatwoot-demo-store"
import { getChatwootAgentName, getChatwootConfig, chatwootFetch, chatwootFetchForm } from "@/lib/chatwoot/client"
import { listSystemEvents } from "@/lib/api/chat-system-events"
import type { ChatwootMessage, NewMessageInput } from "@/lib/types/chatwoot"
import { guardConversationRead, guardConversationWrite, callerAgentId, callerApiToken } from "@/lib/chatwoot/authz"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params
  // Leer el historial es libre para todo el equipo — solo se valida que el
  // id sea real (ver lib/chatwoot/authz.ts).
  const denied = await guardConversationRead(request, id)
  if (denied) return denied

  // Chatwoot solo devuelve la última tanda de mensajes (por defecto, sin
  // esto el historial se veía cortado) — `before` pide la página anterior a
  // ese id de mensaje para poder desplazarse hacia arriba en el historial.
  const beforeParam = new URL(request.url).searchParams.get("before")
  const before = beforeParam && /^[0-9]{1,18}$/.test(beforeParam) ? beforeParam : null

  const config = getChatwootConfig()

  if (config) {
    try {
      const path = before
        ? `/conversations/${id}/messages?before=${before}`
        : `/conversations/${id}/messages`
      const data = await chatwootFetch<{ payload: Record<string, unknown>[] }>(
        path,
        { cache: "no-store" },
      )
      // Los avisos automáticos de Chatwoot (asignó/dejó de intervenir,
      // resolvió...) siempre quedan atribuidos al dueño del token
      // compartido, nunca a quien realmente hizo la acción desde nuestro
      // panel (ver getChatwootAgentName más abajo) — mostrarlos tal cual
      // sería mentir sobre quién hizo qué, así que se ocultan del hilo en
      // vez de arriesgarse a esa atribución incorrecta.
      const messages = data.payload.map(mapChatwootMessage).filter((m) => m.messageType !== "activity")
      // Solo en la tanda inicial (before === null) — al pedir historial más
      // viejo ("cargar más") estas notas ya se mandaron con la primera
      // tanda, agregarlas de nuevo acá las duplicaría en pantalla.
      const combined = before ? messages : mergeSystemEvents(messages, await listSystemEvents(id))
      return NextResponse.json({ messages: combined, source: "chatwoot" })
    } catch {
      return NextResponse.json(
        { error: "error_chatwoot" },
        { status: 502 },
      )
    }
  }

  const conv = getConversation(id)
  if (!conv) {
    return NextResponse.json({ error: "no_encontrado" }, { status: 404 })
  }
  const combined = before
    ? conv.messages
    : mergeSystemEvents(conv.messages, await listSystemEvents(id))
  return NextResponse.json({ messages: combined, source: "demo" })
}

// Intercala las notas de "tomó/soltó la conversación" (ver
// lib/api/chat-system-events.ts) entre los mensajes reales, ordenadas por
// fecha — para que aparezcan en el punto del historial en que realmente
// pasaron, no todas al final.
function mergeSystemEvents(
  messages: ChatwootMessage[],
  events: { content: string; createdAt: string }[],
): ChatwootMessage[] {
  if (events.length === 0) return messages
  const systemMessages: ChatwootMessage[] = events.map((e, i) => ({
    id: `system-${e.createdAt}-${i}`,
    content: e.content,
    messageType: "system",
    senderType: "human",
    senderName: null,
    createdAt: e.createdAt,
    attachments: [],
  }))
  return [...messages, ...systemMessages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )
}

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params
  // Escribir queda restringido a quien la tiene asignada (o al admin,
  // siempre) — sin esto, cualquiera podía escribirle a cualquier cliente en
  // nombre del negocio (message_type: "outgoing"), incluso en un chat de
  // otro asesor.
  const denied = await guardConversationWrite(request, id)
  if (denied) return denied

  const contentType = request.headers.get("content-type") ?? ""
  if (contentType.includes("multipart/form-data")) {
    return handleAttachmentUpload(request, id)
  }

  const body = (await request.json().catch(() => null)) as NewMessageInput | null
  if (!body || typeof body.content !== "string" || body.content.trim().length === 0) {
    return NextResponse.json({ error: "contenido_requerido" }, { status: 400 })
  }

  const inReplyTo = validReplyId(body.inReplyTo)
  if (body.inReplyTo !== undefined && inReplyTo === null) {
    return NextResponse.json({ error: "respuesta_invalida" }, { status: 400 })
  }

  const config = getChatwootConfig()

  if (config) {
    try {
      const contentAttributes = await buildOutgoingContentAttributes(request, inReplyTo)
      // Con el token personal del asesor (si tiene uno vinculado, ver
      // callerApiToken), Chatwoot atribuye este mensaje a SU sender_id real
      // — no al dueño del token compartido. null cae al token compartido
      // dentro de chatwootFetch, mismo comportamiento que antes.
      const data = await chatwootFetch<Record<string, unknown>>(
        `/conversations/${id}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            content: body.content.trim(),
            message_type: "outgoing",
            private: false,
            // Respuesta citada estilo WhatsApp — Chatwoot guarda el id del
            // mensaje original acá y arma la cita hacia Meta con el wamid
            // que ya tiene asociado. No verificado contra un envío real
            // todavía (ver nota en mapChatwootMessage más abajo).
            ...(contentAttributes ? { content_attributes: contentAttributes } : {}),
          }),
        },
        callerApiToken(request),
      )
      return NextResponse.json(mapChatwootMessage(data))
    } catch {
      return NextResponse.json(
        { error: "error_chatwoot" },
        { status: 502 },
      )
    }
  }

  const msg = addMessage(id, { ...body, inReplyTo: inReplyTo ?? undefined })
  if (!msg) {
    return NextResponse.json({ error: "no_encontrado" }, { status: 404 })
  }
  return NextResponse.json(msg, { status: 201 })
}

// Solo acepta el mismo formato de id que ya se usa para `before` (entero de
// Chatwoot como string) — `undefined` es válido (no es una respuesta),
// cualquier otra cosa no.
function validReplyId(raw: unknown): string | null {
  if (raw === undefined) return null
  return typeof raw === "string" && /^[0-9]{1,18}$/.test(raw) ? raw : null
}

// Red de seguridad para cuando NO hay token personal vinculado (admin, o
// asesor sin vincular todavía, ver callerApiToken en lib/chatwoot/authz.ts):
// en ese caso el mensaje le pega a Chatwoot con el token compartido, así que
// Chatwoot lo atribuye al agente dueño de ESE token, no a quien realmente
// está logueado acá. Guardar el nombre real en content_attributes es lo que
// permite mostrar igual "quién de nosotros" mandó el mensaje en nuestra
// propia UI (ver mapChatwootMessage más abajo, que lee esto de vuelta) — no
// cambia el sender_id real dentro de Chatwoot, eso ahora lo resuelve el
// token personal cuando existe. Si el que llama no tiene un agente de
// Chatwoot vinculado, devuelve `null` y el mensaje queda sin ese dato.
async function resolveSentByName(request: Request): Promise<string | null> {
  const agentId = callerAgentId(request)
  if (agentId === null) return null
  return getChatwootAgentName(agentId)
}

async function buildOutgoingContentAttributes(
  request: Request,
  inReplyTo: string | null,
): Promise<Record<string, unknown> | null> {
  const sentByName = await resolveSentByName(request)
  const attrs: Record<string, unknown> = {}
  if (inReplyTo) attrs.in_reply_to = Number(inReplyTo)
  if (sentByName) attrs.sent_by_name = sentByName
  return Object.keys(attrs).length > 0 ? attrs : null
}

// Envío de imágenes (p. ej. guías de envío) — solo funciona con Chatwoot
// real configurado, el store de demo no simula adjuntos salientes.
async function handleAttachmentUpload(request: Request, id: string) {
  const config = getChatwootConfig()
  if (!config) {
    return NextResponse.json({ error: "chatwoot_no_configurado" }, { status: 503 })
  }

  const incomingForm = await request.formData().catch(() => null)
  const file = incomingForm?.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "archivo_requerido" }, { status: 400 })
  }
  const caption = incomingForm?.get("content")
  const inReplyTo = validReplyId(incomingForm?.get("inReplyTo")?.toString() ?? undefined)
  const sentByName = await resolveSentByName(request)

  const outgoingForm = new FormData()
  outgoingForm.set("message_type", "outgoing")
  outgoingForm.set("private", "false")
  if (typeof caption === "string" && caption.trim()) {
    outgoingForm.set("content", caption.trim())
  }
  // Notación de corchetes de Rails para un hash anidado en un form
  // multipart — no verificado contra un envío real todavía, igual que la
  // rama JSON de arriba.
  if (inReplyTo) outgoingForm.set("content_attributes[in_reply_to]", inReplyTo)
  if (sentByName) outgoingForm.set("content_attributes[sent_by_name]", sentByName)
  outgoingForm.append("attachments[]", file, file.name)

  try {
    // Mismo criterio que el POST de texto de arriba: token personal si el
    // asesor tiene uno vinculado, si no cae al compartido dentro de
    // chatwootFetchForm.
    const data = await chatwootFetchForm<Record<string, unknown>>(
      `/conversations/${id}/messages`,
      outgoingForm,
      callerApiToken(request),
    )
    return NextResponse.json(mapChatwootMessage(data))
  } catch {
    return NextResponse.json({ error: "error_chatwoot" }, { status: 502 })
  }
}

function mapChatwootMessage(raw: Record<string, unknown>): ChatwootMessage {
  const sender = (raw.sender as Record<string, unknown>) ?? {}
  const msgType = String(raw.message_type ?? "0")
  const isIncoming = msgType === "0"
  const isOutgoing = msgType === "1"

  let senderType: "customer" | "ai" | "human" = "customer"
  if (isOutgoing) {
    senderType = sender.type === "user" ? "human" : "ai"
  }

  const rawAttachments = Array.isArray(raw.attachments)
    ? (raw.attachments as Record<string, unknown>[])
    : []

  // `content_attributes.in_reply_to` es el campo que usa la propia UI de
  // Chatwoot para respuestas citadas — no confirmado contra una respuesta
  // real de la API todavía (no hay forma de probarlo sin escribirle a un
  // cliente real). Si el nombre del campo resultara distinto, este es el
  // único lugar que hay que tocar.
  const contentAttributes = (raw.content_attributes as Record<string, unknown>) ?? {}
  const inReplyToRaw = contentAttributes.in_reply_to

  // sent_by_name (ver buildOutgoingContentAttributes más arriba) es quién
  // REALMENTE mandó este mensaje desde nuestro panel — sender.name es
  // siempre el dueño del token compartido de Chatwoot, así que se prefiere
  // sent_by_name cuando está. Solo aplica a mensajes salientes de un
  // humano: no tiene sentido para lo que manda el cliente ni para lo que
  // contesta la IA.
  const sentByName = contentAttributes.sent_by_name
  const senderName =
    isOutgoing && senderType === "human" && typeof sentByName === "string" && sentByName
      ? sentByName
      : sender.name
        ? String(sender.name)
        : null

  // Chatwoot no borra la fila al eliminar un mensaje (DELETE de
  // messages/[messageId]/route.ts) — vacía el contenido y los adjuntos, y
  // marca esto en content_attributes. Sin detectarlo, se vería como una
  // burbuja vacía en vez del aviso de "Mensaje eliminado".
  const deleted = contentAttributes.deleted === true

  return {
    id: String(raw.id ?? ""),
    content: deleted ? "" : String(raw.content ?? ""),
    messageType: isIncoming ? "incoming" : isOutgoing ? "outgoing" : "activity",
    senderType,
    senderName,
    createdAt: raw.created_at
      ? new Date((raw.created_at as number) * 1000).toISOString()
      : new Date().toISOString(),
    attachments: deleted ? [] : rawAttachments.map(mapChatwootAttachment),
    status: mapMessageStatus(raw.status),
    inReplyTo: inReplyToRaw != null ? String(inReplyToRaw) : null,
    deleted,
  }
}

const KNOWN_STATUSES = new Set(["sent", "delivered", "read"])

// Antes quedaba fijo en "delivered" para TODO mensaje saliente, así que un
// mensaje recién mandado y uno que el cliente ya leyó se veían con el mismo
// ✓✓ gris. Chatwoot sí trae el estado real acá, y lo mantiene al día vía el
// webhook `message_updated` (ver app/api/chatwoot/webhook) — cuando cambia,
// use-chatwoot.ts ya recarga los mensajes de la conversación activa, así que
// no hace falta tocar nada más para que el check se actualice solo.
function mapMessageStatus(raw: unknown): "sent" | "delivered" | "read" {
  const value = String(raw ?? "")
  return KNOWN_STATUSES.has(value) ? (value as "sent" | "delivered" | "read") : "sent"
}

function mapChatwootAttachment(raw: Record<string, unknown>) {
  const kindRaw = String(raw.file_type ?? "file")
  const kind = ["image", "video", "audio"].includes(kindRaw) ? kindRaw : "file"

  return {
    id: String(raw.id ?? ""),
    fileUrl: String(raw.data_url ?? ""),
    fileType: kindRaw,
    kind: kind as "image" | "video" | "audio" | "file",
    thumbUrl: raw.thumb_url ? String(raw.thumb_url) : null,
  }
}
