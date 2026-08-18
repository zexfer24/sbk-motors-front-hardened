import { describe, expect, it } from "vitest"
import { groupByReadStatus, matchesStatus } from "@/lib/conversation-filters"
import type { ChatwootConversation } from "@/lib/types/chatwoot"

function conv(overrides: Partial<ChatwootConversation>): ChatwootConversation {
  return {
    id: "1",
    contactId: null,
    contactName: "Cliente",
    phone: "+51907642897",
    avatarUrl: null,
    assigneeId: null,
    assigneeName: null,
    inboxId: null,
    inboxName: null,
    lastMessage: null,
    lastMessageAt: null,
    createdAt: "2026-08-12T19:00:00.000Z",
    unreadCount: 0,
    status: "open",
    handledBy: "human",
    online: false,
    typing: false,
    messages: [],
    canWrite: false,
    labels: [],
    ...overrides,
  }
}

describe("matchesStatus — 2026-08-16: Abiertas/Sin contestar dejan de filtrar por 'lo mío'", () => {
  it("'pending' incluye una conversación asignada a OTRO asesor, no solo a mí", () => {
    const c = conv({ status: "open", assigneeId: 999, unreadCount: 3 })
    expect(matchesStatus(c, "pending")).toBe(true)
  })

  it("'open_human' incluye una conversación asignada a OTRO asesor, ya contestada", () => {
    const c = conv({ status: "open", assigneeId: 999, unreadCount: 0 })
    expect(matchesStatus(c, "open_human")).toBe(true)
  })

  it("'pending' también incluye lo sin asignar y sin contestar (pedido explícito, 2026-08-16 tarde)", () => {
    const c = conv({ status: "open", assigneeId: null, unreadCount: 3 })
    expect(matchesStatus(c, "pending")).toBe(true)
  })

  it("'pending' sigue excluyendo lo sin asignar y YA contestado (unreadCount 0)", () => {
    const c = conv({ status: "open", assigneeId: null, unreadCount: 0 })
    expect(matchesStatus(c, "pending")).toBe(false)
  })

  it("'unassigned' sigue siendo solo lo sin asignar y sin contestar", () => {
    const c = conv({ status: "open", assigneeId: null, unreadCount: 2 })
    expect(matchesStatus(c, "unassigned")).toBe(true)
  })

  it("'resolved' sigue siendo solo por status", () => {
    const c = conv({ status: "resolved", assigneeId: 999 })
    expect(matchesStatus(c, "resolved")).toBe(true)
  })
})

describe("matchesStatus — 2026-08-18: 'assigned' (reintroducido, scoped a 'lo mío')", () => {
  it("matchea cuando assigneeId es el del viewer", () => {
    const c = conv({ status: "open", assigneeId: 42 })
    expect(matchesStatus(c, "assigned", 42)).toBe(true)
  })

  it("NO matchea una conversación asignada a OTRO asesor — a propósito, para no repetir el bug de inequidad que hizo quitar este filtro antes", () => {
    const c = conv({ status: "open", assigneeId: 999 })
    expect(matchesStatus(c, "assigned", 42)).toBe(false)
  })

  it("NO matchea lo sin asignar", () => {
    const c = conv({ status: "open", assigneeId: null })
    expect(matchesStatus(c, "assigned", 42)).toBe(false)
  })

  it("sin viewerAgentId (null, valor por defecto) no matchea nada, incluso si assigneeId también es null", () => {
    const c = conv({ status: "open", assigneeId: null })
    expect(matchesStatus(c, "assigned")).toBe(false)
  })

  it("NO matchea una conversación resuelta, aunque siga asignada al viewer", () => {
    const c = conv({ status: "resolved", assigneeId: 42 })
    expect(matchesStatus(c, "assigned", 42)).toBe(false)
  })
})

describe("groupByReadStatus", () => {
  function withUnread(unreadCount: number): { unreadCount: number } {
    return { unreadCount }
  }

  it("separa no-leídos de leídos preservando el orden relativo de cada grupo", () => {
    const list = [withUnread(0), withUnread(3), withUnread(0), withUnread(1)]
    const { unread, read } = groupByReadStatus(list)
    expect(unread).toEqual([withUnread(3), withUnread(1)])
    expect(read).toEqual([withUnread(0), withUnread(0)])
  })

  it("con lista vacía devuelve ambos grupos vacíos", () => {
    expect(groupByReadStatus([])).toEqual({ unread: [], read: [] })
  })

  it("con todo leído, 'unread' queda vacío", () => {
    const list = [withUnread(0), withUnread(0)]
    expect(groupByReadStatus(list).unread).toEqual([])
  })
})
