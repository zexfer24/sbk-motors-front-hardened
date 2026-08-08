import { NextResponse } from "next/server"
import { getConversation, addMessage } from "@/lib/api/chatwoot-demo-store"
import { getChatwootConfig, chatwootFetch, chatwootFetchForm } from "@/lib/chatwoot/client"
import type { NewMessageInput } from "@/lib/types/chatwoot"
import { guardConversationRoute } from "@/lib/chatwoot/authz"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params
  // Leer el historial de un chat ajeno era posible con solo iterar IDs.
  const denied = await guardConversationRoute(request, id)
  if (denied) return denied

  const config = getChatwootConfig()

  if (config) {
    try {
      const data = await chatwootFetch<{ payload: Record<string, unknown>[] }>(
        `/conversations/${id}/messages`,
        { cache: "no-store" },
      )
      const messages = data.payload.map(mapChatwootMessage)
      return NextResponse.json({ messages, source: "chatwoot" })
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
  return NextResponse.json({ messages: conv.messages, source: "demo" })
}

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params
  // Sin esto, cualquier asesor podía escribirle a cualquier cliente en
  // nombre del negocio (message_type: "outgoing").
  const denied = await guardConversationRoute(request, id)
  if (denied) return denied

  const contentType = request.headers.get("content-type") ?? ""
  if (contentType.includes("multipart/form-data")) {
    return handleAttachmentUpload(request, id)
  }

  const body = (await request.json().catch(() => null)) as NewMessageInput | null
  if (!body || typeof body.content !== "string" || body.content.trim().length === 0) {
    return NextResponse.json({ error: "contenido_requerido" }, { status: 400 })
  }

  const config = getChatwootConfig()

  if (config) {
    try {
      const data = await chatwootFetch<Record<string, unknown>>(
        `/conversations/${id}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            content: body.content.trim(),
            message_type: "outgoing",
            private: false,
          }),
        },
      )
      return NextResponse.json(mapChatwootMessage(data))
    } catch {
      return NextResponse.json(
        { error: "error_chatwoot" },
        { status: 502 },
      )
    }
  }

  const msg = addMessage(id, body)
  if (!msg) {
    return NextResponse.json({ error: "no_encontrado" }, { status: 404 })
  }
  return NextResponse.json(msg, { status: 201 })
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

  const outgoingForm = new FormData()
  outgoingForm.set("message_type", "outgoing")
  outgoingForm.set("private", "false")
  if (typeof caption === "string" && caption.trim()) {
    outgoingForm.set("content", caption.trim())
  }
  outgoingForm.append("attachments[]", file, file.name)

  try {
    const data = await chatwootFetchForm<Record<string, unknown>>(
      `/conversations/${id}/messages`,
      outgoingForm,
    )
    return NextResponse.json(mapChatwootMessage(data))
  } catch {
    return NextResponse.json({ error: "error_chatwoot" }, { status: 502 })
  }
}

function mapChatwootMessage(raw: Record<string, unknown>) {
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

  return {
    id: String(raw.id ?? ""),
    content: String(raw.content ?? ""),
    messageType: isIncoming ? "incoming" : isOutgoing ? "outgoing" : "activity",
    senderType,
    senderName: sender.name ? String(sender.name) : null,
    createdAt: raw.created_at
      ? new Date((raw.created_at as number) * 1000).toISOString()
      : new Date().toISOString(),
    attachments: rawAttachments.map(mapChatwootAttachment),
    status: "delivered",
  }
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
