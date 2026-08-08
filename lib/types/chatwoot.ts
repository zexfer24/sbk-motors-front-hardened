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
  messageType: "incoming" | "outgoing" | "activity"
  senderType: SenderType
  senderName: string | null
  createdAt: string
  attachments: ChatwootAttachment[]
  status?: "sent" | "delivered" | "read"
}

export interface ChatwootConversation {
  id: string
  contactName: string
  phone: string
  avatarUrl?: string | null
  assigneeId?: number | null
  assigneeName?: string | null
  lastMessage: string | null
  lastMessageAt: string | null
  /** cuándo se abrió la conversación (distinto de lastMessageAt) — usado para "nuevos chats" del Panel */
  createdAt: string
  unreadCount: number
  status: "open" | "resolved" | "pending"
  handledBy: SenderType
  online: boolean
  typing: boolean
  messages: ChatwootMessage[]
}

export type NewMessageInput = {
  content: string
  messageType: "outgoing" | "activity"
  attachments?: { fileUrl: string; fileType: string }[]
}
