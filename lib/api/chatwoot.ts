import type { ChatwootConversation, ChatwootMessage, NewMessageInput } from "@/lib/types/chatwoot"
import type { DataSource } from "@/lib/api/shared"

function baseUrl() {
  if (typeof window !== "undefined") return ""
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
}

export interface WhatsappTemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS"
  format?: string
  text?: string
}

export interface WhatsappTemplate {
  id: string
  name: string
  status: string
  category: string
  language: string
  components: WhatsappTemplateComponent[]
}

export interface WhatsappInboxTemplates {
  inboxId: number
  inboxName: string
  templates: WhatsappTemplate[]
}

// Agrupadas por buzón — cada número de WhatsApp tiene su propio set de
// plantillas aprobadas por Meta, no se comparten entre buzones.
export async function fetchWhatsappTemplates(): Promise<WhatsappInboxTemplates[]> {
  const res = await fetch(`${baseUrl()}/api/chatwoot/templates`, { cache: "no-store" })
  if (!res.ok) throw new Error("No se pudieron cargar las plantillas")
  const data = await res.json()
  return data.inboxes as WhatsappInboxTemplates[]
}

export interface StartConversationInput {
  inboxId: number
  phone: string
  name: string
  templateName: string
  templateCategory: string
  templateLanguage: string
  bodyParams: string[]
}

export async function startNewConversation(
  input: StartConversationInput,
): Promise<{ conversationId: string } | { error: string }> {
  const res = await fetch(`${baseUrl()}/api/chatwoot/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  const data = await res.json()
  if (!res.ok) return { error: data.error ?? "error_desconocido" }
  return { conversationId: data.conversationId as string }
}

export async function fetchConversations(): Promise<{
  conversations: ChatwootConversation[]
  source: DataSource
}> {
  const res = await fetch(`${baseUrl()}/api/chatwoot/conversations`, { cache: "no-store" })
  if (!res.ok) throw new Error("No se pudieron cargar las conversaciones")
  const data = await res.json()
  return { conversations: data.conversations, source: data.source }
}

export async function fetchMessages(
  conversationId: string,
): Promise<{ messages: ChatwootMessage[]; source: DataSource }> {
  const res = await fetch(
    `${baseUrl()}/api/chatwoot/conversations/${conversationId}/messages`,
    { cache: "no-store" },
  )
  if (!res.ok) throw new Error("No se pudieron cargar los mensajes")
  const data = await res.json()
  return { messages: data.messages, source: data.source }
}

export async function sendMessage(
  conversationId: string,
  input: NewMessageInput,
): Promise<ChatwootMessage> {
  const res = await fetch(
    `${baseUrl()}/api/chatwoot/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  )
  if (!res.ok) throw new Error("No se pudo enviar el mensaje")
  return res.json()
}

export async function sendImageMessage(
  conversationId: string,
  file: File,
  caption?: string,
): Promise<ChatwootMessage> {
  const formData = new FormData()
  formData.append("file", file)
  if (caption?.trim()) formData.append("content", caption.trim())

  const res = await fetch(
    `${baseUrl()}/api/chatwoot/conversations/${conversationId}/messages`,
    { method: "POST", body: formData },
  )
  if (!res.ok) throw new Error("No se pudo enviar la imagen")
  return res.json()
}

export async function toggleIntervention(
  conversationId: string,
  intervene: boolean,
): Promise<{ handledBy: string }> {
  const res = await fetch(
    `${baseUrl()}/api/chatwoot/conversations/${conversationId}/intervene`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intervene }),
    },
  )
  if (!res.ok) {
    if (res.status === 401) throw new Error("Tu sesión expiró — vuelve a iniciar sesión.")
    if (res.status === 403) throw new Error("No tienes permiso para intervenir esta conversación.")
    throw new Error("No se pudo cambiar el estado. Intenta de nuevo.")
  }
  return res.json()
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const res = await fetch(
    `${baseUrl()}/api/chatwoot/conversations/${conversationId}/read`,
    { method: "POST" },
  )
  if (!res.ok) throw new Error("No se pudo marcar como leída")
}

export async function closeConversation(
  conversationId: string,
): Promise<{ status: string; handledBy: string }> {
  const res = await fetch(
    `${baseUrl()}/api/chatwoot/conversations/${conversationId}/close`,
    { method: "POST" },
  )
  if (!res.ok) throw new Error("No se pudo cerrar la conversación")
  return res.json()
}
