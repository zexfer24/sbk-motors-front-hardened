import { describe, expect, it } from "vitest"
import { aggregateAgentStats, type AgentStatsMessageInput, type AgentStatsConversationInput } from "@/lib/chatwoot-agent-stats"

const date = "2026-08-12"
const AGENT = 7
const OTHER_AGENT = 9

function msg(
  conversationId: number,
  messageType: number,
  createdAtIso: string,
  opts: Partial<AgentStatsMessageInput> = {},
): AgentStatsMessageInput {
  return {
    conversationId,
    messageType,
    createdAtIso,
    senderType: null,
    senderId: null,
    private: false,
    ...opts,
  }
}

function incoming(conversationId: number, createdAtIso: string, opts: Partial<AgentStatsMessageInput> = {}) {
  return msg(conversationId, 0, createdAtIso, opts)
}

function outgoingBy(
  conversationId: number,
  createdAtIso: string,
  agentId: number,
  opts: Partial<AgentStatsMessageInput> = {},
) {
  return msg(conversationId, 1, createdAtIso, { senderType: "User", senderId: agentId, ...opts })
}

describe("aggregateAgentStats", () => {
  it("counts a conversation toward chatsRespondidos when the agent sent an outgoing message today", () => {
    const messages = [
      incoming(1, "2026-08-12T10:00:00.000Z"),
      outgoingBy(1, "2026-08-12T10:05:00.000Z", AGENT),
    ]
    const stats = aggregateAgentStats(messages, [], AGENT, date)
    expect(stats.chatsRespondidos).toBe(1)
  })

  it("does not credit a reply sent by a different agent", () => {
    const messages = [
      incoming(1, "2026-08-12T10:00:00.000Z"),
      outgoingBy(1, "2026-08-12T10:05:00.000Z", OTHER_AGENT),
    ]
    const stats = aggregateAgentStats(messages, [], AGENT, date)
    expect(stats.chatsRespondidos).toBe(0)
  })

  it("ignores private notes when counting chatsRespondidos", () => {
    const messages = [outgoingBy(1, "2026-08-12T10:05:00.000Z", AGENT, { private: true })]
    const stats = aggregateAgentStats(messages, [], AGENT, date)
    expect(stats.chatsRespondidos).toBe(0)
  })

  it("counts template messages (type 3) as a valid outgoing reply", () => {
    const messages = [msg(1, 3, "2026-08-12T10:05:00.000Z", { senderType: "User", senderId: AGENT })]
    const stats = aggregateAgentStats(messages, [], AGENT, date)
    expect(stats.chatsRespondidos).toBe(1)
  })

  it("computes velocidadRespuestaSegundos as the gap between an incoming message and the agent's next reply", () => {
    const messages = [
      incoming(1, "2026-08-12T10:00:00.000Z"),
      outgoingBy(1, "2026-08-12T10:02:00.000Z", AGENT), // 120s de hueco
    ]
    const stats = aggregateAgentStats(messages, [], AGENT, date)
    expect(stats.velocidadRespuestaSegundos).toBe(120)
  })

  it("does not create a second sample for consecutive outgoing messages from the same agent", () => {
    const messages = [
      incoming(1, "2026-08-12T10:00:00.000Z"),
      outgoingBy(1, "2026-08-12T10:01:00.000Z", AGENT), // 60s
      outgoingBy(1, "2026-08-12T10:01:30.000Z", AGENT), // parte 2 de la misma respuesta, no cuenta
    ]
    const stats = aggregateAgentStats(messages, [], AGENT, date)
    expect(stats.velocidadRespuestaSegundos).toBe(60)
  })

  it("does not sample a reply that isn't immediately preceded by a customer message", () => {
    const messages = [
      outgoingBy(1, "2026-08-12T09:00:00.000Z", OTHER_AGENT), // otro asesor contestó antes
      outgoingBy(1, "2026-08-12T10:00:00.000Z", AGENT), // este asesor retoma, no hay hueco que medir
    ]
    const stats = aggregateAgentStats(messages, [], AGENT, date)
    expect(stats.velocidadRespuestaSegundos).toBeNull()
  })

  it("returns null velocidadRespuestaSegundos when there are no samples", () => {
    const stats = aggregateAgentStats([], [], AGENT, date)
    expect(stats.velocidadRespuestaSegundos).toBeNull()
  })

  it("computes tasaRespuesta over conversations assigned to the agent that had an incoming message", () => {
    const conversations: AgentStatsConversationInput[] = [
      { id: 1, assigneeId: AGENT },
      { id: 2, assigneeId: AGENT },
    ]
    const messages = [
      incoming(1, "2026-08-12T10:00:00.000Z"),
      outgoingBy(1, "2026-08-12T10:05:00.000Z", AGENT),
      incoming(2, "2026-08-12T11:00:00.000Z"), // nunca contestada
    ]
    const stats = aggregateAgentStats(messages, conversations, AGENT, date)
    expect(stats.tasaRespuesta).toBe(50)
  })

  it("excludes conversations not assigned to the agent from tasaRespuesta", () => {
    const conversations: AgentStatsConversationInput[] = [{ id: 1, assigneeId: OTHER_AGENT }]
    const messages = [incoming(1, "2026-08-12T10:00:00.000Z")]
    const stats = aggregateAgentStats(messages, conversations, AGENT, date)
    expect(stats.tasaRespuesta).toBeNull()
  })

  it("adds the gap of an unanswered assigned conversation to tiempoMuertoSegundos, clipped to now", () => {
    const conversations: AgentStatsConversationInput[] = [{ id: 1, assigneeId: AGENT }]
    const messages = [incoming(1, "2026-08-12T10:00:00.000Z")]
    const now = new Date("2026-08-12T10:10:00.000Z") // 600s sin contestar
    const stats = aggregateAgentStats(messages, conversations, AGENT, date, now)
    expect(stats.tiempoMuertoSegundos).toBe(600)
  })

  it("clips pending dead time to the start of today, not before", () => {
    const conversations: AgentStatsConversationInput[] = [{ id: 1, assigneeId: AGENT }]
    // Mensaje sin contestar desde AYER (llegó antes del inicio de hoy en Caracas, 04:00 UTC)
    const messages = [incoming(1, "2026-08-10T10:00:00.000Z")]
    const now = new Date("2026-08-12T05:00:00.000Z") // 1h después de que empezó hoy
    const stats = aggregateAgentStats(messages, conversations, AGENT, date, now)
    expect(stats.tiempoMuertoSegundos).toBe(3600)
  })

  it("does not add pending dead time for a conversation already answered", () => {
    const conversations: AgentStatsConversationInput[] = [{ id: 1, assigneeId: AGENT }]
    const messages = [
      incoming(1, "2026-08-12T10:00:00.000Z"),
      outgoingBy(1, "2026-08-12T10:01:00.000Z", AGENT),
    ]
    const now = new Date("2026-08-12T12:00:00.000Z")
    const stats = aggregateAgentStats(messages, conversations, AGENT, date, now)
    expect(stats.tiempoMuertoSegundos).toBe(60) // solo el hueco ya cerrado, nada pendiente
  })

  it("separates today's and yesterday's samples correctly", () => {
    const messages = [
      incoming(1, "2026-08-11T10:00:00.000Z"),
      outgoingBy(1, "2026-08-11T10:01:00.000Z", AGENT), // ayer, 60s
      incoming(2, "2026-08-12T10:00:00.000Z"),
      outgoingBy(2, "2026-08-12T10:05:00.000Z", AGENT), // hoy, 300s
    ]
    const stats = aggregateAgentStats(messages, [], AGENT, date)
    expect(stats.velocidadRespuestaSegundos).toBe(300)
    expect(stats.velocidadRespuestaSegundosAyer).toBe(60)
    expect(stats.chatsRespondidos).toBe(1)
    expect(stats.chatsRespondidosAyer).toBe(1)
  })

  it("marks the result as available", () => {
    const stats = aggregateAgentStats([], [], AGENT, date)
    expect(stats.available).toBe(true)
  })
})
