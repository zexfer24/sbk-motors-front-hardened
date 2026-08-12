import { describe, expect, it } from "vitest"
import { aggregateKpiStats, bucketHourlyMessages } from "@/lib/chatwoot-stats"
import { caracasOperatingHoursBoundsUtc } from "@/lib/caracas-time"

describe("aggregateKpiStats", () => {
  const date = "2026-08-12"

  it("counts conversations created within today's Caracas day bounds as newChatsToday", () => {
    const conversations = [
      { contactId: 1, createdAtIso: "2026-08-12T10:00:00.000Z" }, // hoy
      { contactId: 2, createdAtIso: "2026-08-11T10:00:00.000Z" }, // ayer, no cuenta
    ]
    const stats = aggregateKpiStats(conversations, date)
    expect(stats.newChatsToday).toBe(1)
  })

  it("counts conversations created within yesterday's Caracas day bounds as newChatsYesterday", () => {
    const conversations = [
      { contactId: 1, createdAtIso: "2026-08-11T10:00:00.000Z" }, // ayer
      { contactId: 2, createdAtIso: "2026-08-12T10:00:00.000Z" }, // hoy, no cuenta
    ]
    const stats = aggregateKpiStats(conversations, date)
    expect(stats.newChatsYesterday).toBe(1)
  })

  it("counts each contact once toward totalCustomers, using their earliest conversation", () => {
    const conversations = [
      { contactId: 1, createdAtIso: "2026-08-10T10:00:00.000Z" },
      { contactId: 1, createdAtIso: "2026-08-12T10:00:00.000Z" }, // mismo contacto, chat posterior
      { contactId: 2, createdAtIso: "2026-08-09T10:00:00.000Z" },
    ]
    const stats = aggregateKpiStats(conversations, date)
    expect(stats.totalCustomers).toBe(2)
  })

  it("excludes conversations with contactId 0 from customer totals", () => {
    const conversations = [{ contactId: 0, createdAtIso: "2026-08-10T10:00:00.000Z" }]
    const stats = aggregateKpiStats(conversations, date)
    expect(stats.totalCustomers).toBe(0)
  })

  it("totalCustomersYesterday only counts customers first seen before today started", () => {
    const conversations = [
      { contactId: 1, createdAtIso: "2026-08-11T10:00:00.000Z" }, // antes de que empezara hoy -> cuenta en ambos
      { contactId: 2, createdAtIso: "2026-08-12T10:00:00.000Z" }, // solo hoy
    ]
    const stats = aggregateKpiStats(conversations, date)
    expect(stats.totalCustomersYesterday).toBe(1)
    expect(stats.totalCustomers).toBe(2)
  })

  it("marks the result as available", () => {
    const stats = aggregateKpiStats([], date)
    expect(stats.available).toBe(true)
  })
})

describe("bucketHourlyMessages", () => {
  const date = "2026-08-12"
  const bounds = caracasOperatingHoursBoundsUtc(date)

  it("counts incoming messages (type 0) as chats at the right hour index", () => {
    // Caracas 12:00 (UTC-4) -> 16:00 UTC, índice = hora local = 12
    const messages = [{ messageType: 0, createdAtIso: "2026-08-12T16:00:00.000Z" }]
    const stats = bucketHourlyMessages(messages, bounds)
    expect(stats.chats[12]).toBe(1)
    expect(stats.messages[12]).toBe(0)
  })

  it("counts outgoing messages (type 1) as messages at the right hour index", () => {
    // Caracas 20:00 (UTC-4) -> día siguiente 00:00 UTC, índice = hora local = 20
    const messages = [{ messageType: 1, createdAtIso: "2026-08-13T00:00:00.000Z" }]
    const stats = bucketHourlyMessages(messages, bounds)
    expect(stats.messages[20]).toBe(1)
    expect(stats.chats[20]).toBe(0)
  })

  it("ignores messages outside the given bounds", () => {
    const justBeforeStart = new Date(new Date(bounds.startUtc).getTime() - 60_000).toISOString()
    const messages = [{ messageType: 0, createdAtIso: justBeforeStart }]
    const stats = bucketHourlyMessages(messages, bounds)
    expect(stats.chats.every((n) => n === 0)).toBe(true)
  })

  it("ignores messages with an unknown message_type", () => {
    const messages = [{ messageType: 2, createdAtIso: "2026-08-12T16:00:00.000Z" }]
    const stats = bucketHourlyMessages(messages, bounds)
    expect(stats.chats.every((n) => n === 0)).toBe(true)
    expect(stats.messages.every((n) => n === 0)).toBe(true)
  })

  it("marks the result as available", () => {
    const stats = bucketHourlyMessages([], bounds)
    expect(stats.available).toBe(true)
  })
})
