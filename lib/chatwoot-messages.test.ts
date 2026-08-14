import { describe, expect, it } from "vitest"
import { mergeSystemEvents, oldestRealMessageId } from "@/lib/chatwoot-messages"
import type { ChatwootMessage } from "@/lib/types/chatwoot"

function realMsg(id: string, createdAt: string): ChatwootMessage {
  return {
    id,
    content: "hola",
    messageType: "incoming",
    senderType: "customer",
    senderName: null,
    createdAt,
    attachments: [],
  }
}

describe("oldestRealMessageId", () => {
  it("returns the id of the first real message when the batch starts with one", () => {
    const messages = [realMsg("100", "2026-08-10T23:18:00.000Z"), realMsg("101", "2026-08-10T23:20:00.000Z")]
    expect(oldestRealMessageId(messages)).toBe("100")
  })

  it("skips leading synthetic system notes and returns the first real numeric id", () => {
    const messages: ChatwootMessage[] = [
      {
        id: "system-2026-08-12T18:59:51.000Z-0",
        content: '"Leonardo" auto-asignado',
        messageType: "system",
        senderType: "human",
        senderName: null,
        createdAt: "2026-08-12T18:59:51.000Z",
        attachments: [],
      },
      realMsg("200", "2026-08-12T19:02:45.000Z"),
    ]
    expect(oldestRealMessageId(messages)).toBe("200")
  })

  it("returns null when every message in the batch is a synthetic note", () => {
    const messages: ChatwootMessage[] = [
      {
        id: "system-2026-08-12T18:59:51.000Z-0",
        content: "nota",
        messageType: "system",
        senderType: "human",
        senderName: null,
        createdAt: "2026-08-12T18:59:51.000Z",
        attachments: [],
      },
    ]
    expect(oldestRealMessageId(messages)).toBeNull()
  })
})

describe("mergeSystemEvents", () => {
  it("interleaves an event that falls within the loaded batch, sorted by date", () => {
    const messages = [realMsg("1", "2026-08-12T19:00:00.000Z"), realMsg("2", "2026-08-12T19:05:00.000Z")]
    const events = [{ content: "tomó el chat", createdAt: "2026-08-12T19:02:00.000Z" }]
    const merged = mergeSystemEvents(messages, events)
    expect(merged.map((m) => m.id)).toEqual(["1", expect.stringContaining("system-"), "2"])
  })

  it("drops an event older than the oldest real message in the batch (Leonardo Mora repro)", () => {
    // Igual que conversation_id 74: notas a las 18:59:51/56/19:00:16, primer
    // mensaje real cargado recién a las 19:02:45 — sin el fix, esas notas
    // quedan primero en el arreglo y rompen la paginación (ver
    // oldestRealMessageId de arriba).
    const messages = [realMsg("50", "2026-08-12T19:02:45.000Z")]
    const events = [
      { content: '"Leonardo" auto-asignado', createdAt: "2026-08-12T18:59:51.000Z" },
      { content: "soltó el chat", createdAt: "2026-08-12T18:59:56.000Z" },
      { content: '"Leonardo" auto-asignado', createdAt: "2026-08-12T19:00:16.000Z" },
    ]
    const merged = mergeSystemEvents(messages, events)
    expect(merged).toEqual(messages)
  })

  it("keeps an event that falls after the newest loaded message", () => {
    const messages = [realMsg("1", "2026-08-12T19:00:00.000Z")]
    const events = [{ content: "soltó el chat", createdAt: "2026-08-12T19:10:00.000Z" }]
    const merged = mergeSystemEvents(messages, events)
    expect(merged).toHaveLength(2)
  })

  it("returns the messages unchanged when there are no events", () => {
    const messages = [realMsg("1", "2026-08-12T19:00:00.000Z")]
    expect(mergeSystemEvents(messages, [])).toEqual(messages)
  })
})
