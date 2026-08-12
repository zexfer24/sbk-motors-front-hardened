import type { ChatwootConversation, ChatwootMessage, NewMessageInput } from "@/lib/types/chatwoot"

// El store de demo no tiene un concepto real de "dueño" ni de catálogo de
// etiquetas de Chatwoot detrás — `canWrite`/`labels` se agregan siempre al
// leer, en vez de guardarse en cada conversación semilla.
type DemoConversation = Omit<ChatwootConversation, "canWrite" | "labels">

const globalForStore = globalThis as unknown as {
  __chatwootStore?: DemoConversation[]
}

function getStore(): DemoConversation[] {
  if (!globalForStore.__chatwootStore) {
    globalForStore.__chatwootStore = seedConversations()
  }
  return globalForStore.__chatwootStore
}

function seedConversations(): DemoConversation[] {
  return [
    {
      id: "demo-c1",
      contactName: "Marco Salinas",
      phone: "+58 412 555 1023",
      lastMessage: "¿Tienen pastillas para una Pulsar NS200?",
      lastMessageAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
      createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
      unreadCount: 2,
      status: "open",
      handledBy: "ai",
      online: true,
      typing: true,
      messages: [
        {
          id: "dm1",
          content: "Hola, buenas tardes. Necesito repuestos para mi moto.",
          messageType: "incoming",
          senderType: "customer",
          senderName: "Marco Salinas",
          createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
          attachments: [],
        },
        {
          id: "dm2",
          content:
            "¡Hola Marco! Bienvenido a SBK Motors. Con gusto te ayudo. ¿Qué modelo de moto tienes y qué repuesto buscas?",
          messageType: "outgoing",
          senderType: "ai",
          senderName: "Asistente IA",
          createdAt: new Date(Date.now() - 1000 * 60 * 11).toISOString(),
          attachments: [],
          status: "read",
        },
        {
          id: "dm3",
          content: "Es una Bajaj Pulsar NS200.",
          messageType: "incoming",
          senderType: "customer",
          senderName: "Marco Salinas",
          createdAt: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
          attachments: [],
        },
        {
          id: "dm4",
          content: "¿Tienen pastillas para una Pulsar NS200?",
          messageType: "incoming",
          senderType: "customer",
          senderName: "Marco Salinas",
          createdAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
          attachments: [],
        },
        {
          id: "dm5",
          content:
            "Sí, tenemos pastillas sinterizadas compatibles (SKU FRN-PST-SNT) a US$ 28.90. Quedan 3 en stock. ¿Deseas reservarlas?",
          messageType: "outgoing",
          senderType: "ai",
          senderName: "Asistente IA",
          createdAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
          attachments: [],
          status: "delivered",
        },
      ],
    },
    {
      id: "demo-c2",
      contactName: "Lucía Fernández",
      phone: "+58 414 778 2210",
      lastMessage: "Perfecto, paso mañana a recoger el casco.",
      lastMessageAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
      unreadCount: 0,
      status: "open",
      handledBy: "human",
      online: false,
      typing: false,
      messages: [
        {
          id: "dm6",
          content: "Quería confirmar si llegó el casco integral que pedí.",
          messageType: "incoming",
          senderType: "customer",
          senderName: "Lucía Fernández",
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
          attachments: [],
        },
        {
          id: "dm7",
          content: "Déjame verificar con el equipo del taller, un momento por favor.",
          messageType: "outgoing",
          senderType: "ai",
          senderName: "Asistente IA",
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
          attachments: [],
          status: "read",
        },
        {
          id: "dm8",
          content:
            "Hola Lucía, soy Diego del taller. Tu casco fibra talla M ya está disponible para recojo.",
          messageType: "outgoing",
          senderType: "human",
          senderName: "Diego (Taller)",
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
          attachments: [],
          status: "read",
        },
        {
          id: "dm9",
          content: "Perfecto, paso mañana a recoger el casco.",
          messageType: "incoming",
          senderType: "customer",
          senderName: "Lucía Fernández",
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
          attachments: [],
        },
      ],
    },
    {
      id: "demo-c3",
      contactName: "Renzo Quispe",
      phone: "+58 424 331 8890",
      lastMessage: "Gracias por la cotización 🙌",
      lastMessageAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
      unreadCount: 0,
      status: "open",
      handledBy: "ai",
      online: true,
      typing: false,
      messages: [
        {
          id: "dm10",
          content: "Buenas, cuánto cuesta una cadena DID 520?",
          messageType: "incoming",
          senderType: "customer",
          senderName: "Renzo Quispe",
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
          attachments: [],
        },
        {
          id: "dm11",
          content: "La cadena DID 520 X-Ring cuesta US$ 64.00 e incluye garantía de 6 meses.",
          messageType: "outgoing",
          senderType: "ai",
          senderName: "Asistente IA",
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
          attachments: [],
          status: "read",
        },
        {
          id: "dm12",
          content: "Gracias por la cotización 🙌",
          messageType: "incoming",
          senderType: "customer",
          senderName: "Renzo Quispe",
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
          attachments: [],
        },
      ],
    },
    {
      id: "demo-c4",
      contactName: "Andrea Ríos",
      phone: "+58 416 220 4471",
      lastMessage: "¿Hacen envíos a Maracaibo?",
      lastMessageAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
      unreadCount: 1,
      status: "open",
      handledBy: "ai",
      online: false,
      typing: false,
      messages: [
        {
          id: "dm13",
          content: "¿Hacen envíos a Maracaibo?",
          messageType: "incoming",
          senderType: "customer",
          senderName: "Andrea Ríos",
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
          attachments: [],
        },
        {
          id: "dm14",
          content: "Sí, enviamos a todo el país por Zoom y MRW. El costo depende del destino y peso.",
          messageType: "outgoing",
          senderType: "ai",
          senderName: "Asistente IA",
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
          attachments: [],
          status: "delivered",
        },
      ],
    },
    {
      id: "demo-c5",
      contactName: "Taller El Rápido",
      phone: "+58 426 909 1188",
      lastMessage: "Necesito 10 kits de juntas al por mayor.",
      lastMessageAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
      unreadCount: 0,
      status: "open",
      handledBy: "human",
      online: true,
      typing: false,
      messages: [
        {
          id: "dm15",
          content: "Necesito 10 kits de juntas al por mayor.",
          messageType: "incoming",
          senderType: "customer",
          senderName: "Taller El Rápido",
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
          attachments: [],
        },
        {
          id: "dm16",
          content:
            "Claro, te preparo una cotización mayorista con descuento por volumen.",
          messageType: "outgoing",
          senderType: "human",
          senderName: "Diego (Taller)",
          createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
          attachments: [],
          status: "read",
        },
      ],
    },
  ]
}

// Orden de llegada (más viejo arriba, los nuevos abajo) — mismo criterio
// que sweepConversations en lib/api/chatwoot-sync.ts, para que el modo demo
// (sin Chatwoot configurado) se comporte igual que producción.
export function listConversations(): ChatwootConversation[] {
  return [...getStore()]
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    .map((c) => ({ ...c, canWrite: true, labels: [] }))
}

export function getConversation(id: string): ChatwootConversation | null {
  const conv = getStore().find((c) => c.id === id)
  return conv ? { ...conv, canWrite: true, labels: [] } : null
}

export function addMessage(
  conversationId: string,
  input: NewMessageInput,
): ChatwootMessage | null {
  const store = getStore()
  const conv = store.find((c) => c.id === conversationId)
  if (!conv) return null

  const msg: ChatwootMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    content: input.content,
    messageType: input.messageType,
    senderType: "human",
    senderName: "Asesor",
    createdAt: new Date().toISOString(),
    attachments: (input.attachments ?? []).map((att, i) => ({
      id: `att-${Date.now()}-${i}`,
      fileUrl: att.fileUrl,
      fileType: att.fileType,
      kind: (["image", "video", "audio"].includes(att.fileType)
        ? att.fileType
        : "file") as "image" | "video" | "audio" | "file",
      thumbUrl: null,
    })),
    status: "sent",
    inReplyTo: input.inReplyTo ?? null,
  }

  conv.messages = [...conv.messages, msg]
  conv.lastMessage = input.content
  conv.lastMessageAt = msg.createdAt
  conv.handledBy = "human"

  return msg
}

// No borra la fila, la marca como eliminada (mismo criterio que Chatwoot
// real, ver el DELETE de messages/[messageId]/route.ts) — así el hueco
// queda visible en el historial en vez de reordenar todo lo demás.
export function deleteMessage(conversationId: string, messageId: string): boolean {
  const store = getStore()
  const conv = store.find((c) => c.id === conversationId)
  if (!conv) return false
  const msg = conv.messages.find((m) => m.id === messageId)
  if (!msg) return false
  msg.content = ""
  msg.deleted = true
  msg.attachments = []
  return true
}

export function markAsRead(conversationId: string): void {
  const store = getStore()
  const conv = store.find((c) => c.id === conversationId)
  if (conv) conv.unreadCount = 0
}

export function markAsUnread(conversationId: string): void {
  const store = getStore()
  const conv = store.find((c) => c.id === conversationId)
  if (conv) conv.unreadCount = Math.max(conv.unreadCount, 1)
}
