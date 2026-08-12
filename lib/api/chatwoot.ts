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

// `before` pide la página de mensajes anteriores al que traiga ese id — así
// se puede desplazar hacia arriba en el historial en vez de quedarse solo
// con la última tanda que trae Chatwoot por defecto.
export async function fetchMessages(
  conversationId: string,
  before?: string,
): Promise<{ messages: ChatwootMessage[]; source: DataSource }> {
  const qs = before ? `?before=${encodeURIComponent(before)}` : ""
  const res = await fetch(
    `${baseUrl()}/api/chatwoot/conversations/${conversationId}/messages${qs}`,
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
  inReplyTo?: string,
): Promise<ChatwootMessage> {
  const formData = new FormData()
  formData.append("file", file)
  if (caption?.trim()) formData.append("content", caption.trim())
  if (inReplyTo) formData.append("inReplyTo", inReplyTo)

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

// Borra un mensaje ya mandado — de ESTE panel/Chatwoot, no del teléfono del
// cliente (ver el comentario del route.ts sobre por qué no existe "editar").
export async function deleteMessage(conversationId: string, messageId: string): Promise<void> {
  const res = await fetch(
    `${baseUrl()}/api/chatwoot/conversations/${conversationId}/messages/${messageId}`,
    { method: "DELETE" },
  )
  if (!res.ok) throw new Error("No se pudo borrar el mensaje")
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const res = await fetch(
    `${baseUrl()}/api/chatwoot/conversations/${conversationId}/read`,
    { method: "POST" },
  )
  if (!res.ok) throw new Error("No se pudo marcar como leída")
}

// Contraparte de markConversationRead — para devolver a mano una
// conversación al tab "Sin contestar" sin esperar a que llegue un mensaje
// nuevo de verdad.
export async function markConversationUnread(conversationId: string): Promise<void> {
  const res = await fetch(
    `${baseUrl()}/api/chatwoot/conversations/${conversationId}/unread`,
    { method: "POST" },
  )
  if (!res.ok) throw new Error("No se pudo marcar como no leída")
}

export interface Agent {
  email: string
  role: "admin" | "asesor"
  chatwootAgentId: number | null
}

// admin-only (ver proxy.ts) — lista los asesores con agente de Chatwoot
// vinculado, para el selector de "Asignar a…".
export async function fetchAgents(): Promise<Agent[]> {
  const res = await fetch(`${baseUrl()}/api/agents`, { cache: "no-store" })
  if (!res.ok) throw new Error("No se pudo cargar la lista de asesores")
  const data = await res.json()
  return data.agents as Agent[]
}

// admin-only — asigna una conversación directamente a un asesor concreto
// (o la desasigna con `null`), sin pasar por el flujo de "Intervenir".
export async function assignConversation(
  conversationId: string,
  assigneeId: number | null,
): Promise<void> {
  const res = await fetch(
    `${baseUrl()}/api/chatwoot/conversations/${conversationId}/assign`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assigneeId }),
    },
  )
  if (!res.ok) {
    if (res.status === 403) throw new Error("No tienes permiso para asignar esta conversación.")
    throw new Error("No se pudo asignar la conversación.")
  }
}

export interface ChatwootLabel {
  id: number
  title: string
  description: string | null
  color: string
  showOnSidebar: boolean
}

// Catálogo de categorías de la cuenta — cualquier autenticado lo puede leer.
export async function fetchLabels(): Promise<ChatwootLabel[]> {
  const res = await fetch(`${baseUrl()}/api/chatwoot/labels`, { cache: "no-store" })
  if (!res.ok) throw new Error("No se pudieron cargar las categorías")
  const data = await res.json()
  return data.labels as ChatwootLabel[]
}

// admin-only (ver proxy.ts) — crea una categoría nueva en el catálogo.
export async function createLabel(input: { title: string; color: string }): Promise<ChatwootLabel> {
  const res = await fetch(`${baseUrl()}/api/chatwoot/labels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    if (res.status === 403) throw new Error("No tienes permiso para crear categorías.")
    throw new Error("No se pudo crear la categoría.")
  }
  return res.json()
}

// Reemplaza el set completo de etiquetas de una conversación.
export async function setConversationLabels(
  conversationId: string,
  labels: string[],
): Promise<string[]> {
  const res = await fetch(
    `${baseUrl()}/api/chatwoot/conversations/${conversationId}/labels`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ labels }),
    },
  )
  if (!res.ok) {
    if (res.status === 403) throw new Error("No tienes permiso para etiquetar esta conversación.")
    throw new Error("No se pudieron guardar las etiquetas.")
  }
  const data = await res.json()
  return data.labels as string[]
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
