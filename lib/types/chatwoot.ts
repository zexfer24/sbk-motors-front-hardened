export type SenderType = "customer" | "ai" | "human"

export type AttachmentKind = "image" | "video" | "audio" | "file"

export interface ChatwootAttachment {
  id: string
  fileUrl: string
  fileType: string
  kind: AttachmentKind
  thumbUrl?: string | null
}

export interface ChatwootMessage {
  id: string
  content: string
  messageType: "incoming" | "outgoing" | "activity" | "system"
  senderType: SenderType
  senderName: string | null
  createdAt: string
  attachments: ChatwootAttachment[]
  status?: "sent" | "delivered" | "read"
  /** id (de Chatwoot) del mensaje al que este responde — respuesta citada estilo WhatsApp. */
  inReplyTo?: string | null
  /** true si se borró (ver DELETE de conversations/[id]/messages/[messageId]) — el contenido ya viene vacío, esto es solo para mostrar el aviso de "Mensaje eliminado" en vez de una burbuja vacía. */
  deleted?: boolean
}

export interface ChatwootConversation {
  id: string
  /** id de contacto de Chatwoot (no de conversación) — mismo cliente puede tener varias conversaciones. Usado para notas privadas por cliente (ver lib/api/chat-notes.ts). Ausente en modo demo. */
  contactId?: number | null
  contactName: string
  phone: string
  avatarUrl?: string | null
  assigneeId?: number | null
  assigneeName?: string | null
  /** Buzón de Chatwoot del que viene — útil con más de un número de WhatsApp activo. */
  inboxId?: number | null
  inboxName?: string | null
  lastMessage: string | null
  lastMessageAt: string | null
  /** Status (sent/delivered/read) del último mensaje del hilo — SOLO si ese último mensaje es saliente (nuestro), null en cualquier otro caso (lo último es del cliente, o no hay mensajes). Mismo criterio que WhatsApp: el check de la miniatura solo aparece cuando lo último que se ve en el preview es algo que mandamos nosotros. */
  lastMessageStatus?: "sent" | "delivered" | "read" | null
  /** cuándo se abrió la conversación (distinto de lastMessageAt) — usado para "nuevos chats" del Panel */
  createdAt: string
  unreadCount: number
  status: "open" | "resolved" | "pending"
  handledBy: SenderType
  online: boolean
  typing: boolean
  messages: ChatwootMessage[]
  /**
   * Derivado en el servidor (nunca del cliente): admin siempre true; asesor
   * solo si `assigneeId` es el suyo. Todo el equipo puede LEER cualquier
   * conversación — esto solo gobierna si el compositor está habilitado.
   */
  canWrite: boolean
  /** Títulos de las etiquetas (labels) de Chatwoot asignadas a esta conversación. */
  labels: string[]
}

export type NewMessageInput = {
  content: string
  messageType: "outgoing" | "activity"
  attachments?: { fileUrl: string; fileType: string }[]
  /** id del mensaje entrante al que se responde — ver ChatwootMessage.inReplyTo. */
  inReplyTo?: string
}
