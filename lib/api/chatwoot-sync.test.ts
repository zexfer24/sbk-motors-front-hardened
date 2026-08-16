import { describe, expect, it } from "vitest"
import { mapChatwootConversation } from "@/lib/api/chatwoot-sync"

function rawConversation(messages: Record<string, unknown>[]): Record<string, unknown> {
  return {
    id: 74,
    meta: { sender: { id: 1, name: "Cliente", phone_number: "+51907642897" } },
    inbox_id: 1,
    created_at: 1755000000,
    unread_count: 0,
    status: "open",
    labels: [],
    messages,
  }
}

describe("mapChatwootConversation — preview del último mensaje", () => {
  it("usa el último mensaje real como preview cuando no hay notas de actividad de por medio", () => {
    const raw = rawConversation([
      { message_type: 0, content: "hola", created_at: 1755000100 },
      { message_type: 1, content: "buenas, en qué te ayudo", created_at: 1755000200 },
    ])
    const conv = mapChatwootConversation(raw, new Map())
    expect(conv.lastMessage).toBe("buenas, en qué te ayudo")
  })

  it("salta la nota nativa de 'Conversación asignada' (message_type 2) y usa el último mensaje real anterior", () => {
    const raw = rawConversation([
      { message_type: 0, content: "hola", created_at: 1755000100 },
      { message_type: 1, content: "buenas, en qué te ayudo", created_at: 1755000200 },
      { message_type: 2, content: "Conversation was assigned to Leonardo", created_at: 1755000300 },
    ])
    const conv = mapChatwootConversation(raw, new Map())
    expect(conv.lastMessage).toBe("buenas, en qué te ayudo")
    expect(conv.lastMessageAt).toBe(new Date(1755000200 * 1000).toISOString())
  })

  it("devuelve null si la conversación no tiene ningún mensaje real todavía, solo notas de actividad", () => {
    const raw = rawConversation([{ message_type: 2, content: "Conversation was assigned to Leonardo", created_at: 1755000300 }])
    const conv = mapChatwootConversation(raw, new Map())
    expect(conv.lastMessage).toBeNull()
    expect(conv.lastMessageAt).toBeNull()
  })
})
