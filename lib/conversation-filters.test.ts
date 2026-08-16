import { describe, expect, it } from "vitest"
import { matchesStatus } from "@/lib/conversation-filters"
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

  it("'pending' sigue excluyendo lo sin asignar (eso es 'unassigned'/Libres)", () => {
    const c = conv({ status: "open", assigneeId: null, unreadCount: 3 })
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
