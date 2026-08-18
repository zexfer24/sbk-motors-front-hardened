import { describe, expect, it } from "vitest"
import {
  mergeRefreshedMessages,
  mergeSystemEvents,
  normalizeMessageStatus,
  oldestRealMessageId,
} from "@/lib/chatwoot-messages"
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

describe("mergeRefreshedMessages", () => {
  it("repro del bug reportado: preserva el historial viejo cargado con 'Cargar mensajes anteriores' cuando llega un mensaje nuevo por SSE", () => {
    // El asesor scrolleó arriba y cargó 3 mensajes viejos (loadOlderMessages
    // los antepuso). Llega un mensaje nuevo del cliente -> el SSE dispara
    // loadMessages(activeId), que trae la ÚLTIMA tanda de Chatwoot: solo los
    // 2 más recientes (los viejos no vienen, Chatwoot no los repite sin
    // `before`). Antes del fix esto reemplazaba `prev` entero y los 3
    // mensajes viejos desaparecían de la pantalla.
    const oldHistory = [
      realMsg("1", "2026-08-12T18:00:00.000Z"),
      realMsg("2", "2026-08-12T18:05:00.000Z"),
      realMsg("3", "2026-08-12T18:10:00.000Z"),
    ]
    const currentPage = [
      realMsg("4", "2026-08-12T19:00:00.000Z"),
      realMsg("5", "2026-08-12T19:05:00.000Z"),
    ]
    const prev = [...oldHistory, ...currentPage]
    const freshFromSse = [...currentPage, realMsg("6", "2026-08-12T19:10:00.000Z")]

    const merged = mergeRefreshedMessages(prev, freshFromSse)

    expect(merged.map((m) => m.id)).toEqual(["1", "2", "3", "4", "5", "6"])
  })

  it("no duplica un mensaje que ya estaba en prev y vuelve a venir en la tanda fresca", () => {
    const prev = [realMsg("1", "2026-08-12T19:00:00.000Z"), realMsg("2", "2026-08-12T19:05:00.000Z")]
    const fresh = [realMsg("2", "2026-08-12T19:05:00.000Z"), realMsg("3", "2026-08-12T19:10:00.000Z")]
    const merged = mergeRefreshedMessages(prev, fresh)
    expect(merged.map((m) => m.id)).toEqual(["1", "2", "3"])
  })

  it("con prev vacío (carga inicial de la conversación) devuelve la tanda fresca tal cual", () => {
    const fresh = [realMsg("4", "2026-08-12T19:00:00.000Z")]
    expect(mergeRefreshedMessages([], fresh)).toEqual(fresh)
  })

  it("con fresh vacío devuelve fresh (Chatwoot no tiene mensajes) en vez de conservar prev a ciegas", () => {
    const prev = [realMsg("1", "2026-08-12T19:00:00.000Z")]
    expect(mergeRefreshedMessages(prev, [])).toEqual([])
  })
})

describe("normalizeMessageStatus", () => {
  it.each(["sent", "delivered", "read"] as const)("deja pasar '%s' sin tocarlo", (status) => {
    expect(normalizeMessageStatus(status)).toBe(status)
  })

  it("'failed' cae a 'sent' — mismo criterio que antes, ni el mensaje individual ni la miniatura distinguen fallos todavía", () => {
    expect(normalizeMessageStatus("failed")).toBe("sent")
  })

  it("undefined/null/valor desconocido caen a 'sent'", () => {
    expect(normalizeMessageStatus(undefined)).toBe("sent")
    expect(normalizeMessageStatus(null)).toBe("sent")
    expect(normalizeMessageStatus("algo_nuevo_que_chatwoot_invente")).toBe("sent")
  })
})
