import { describe, expect, it } from "vitest"
import { aggregateAgentStats, type AgentStatsMessageInput, type AgentStatsConversationInput } from "@/lib/chatwoot-agent-stats"

// 2026-08-12 es miércoles (horario lunes-sábado 8:30am-7:30pm Caracas =
// 12:30-23:30 UTC). Los horarios de los fixtures de abajo caen dentro de
// esa ventana salvo que el test diga explícitamente lo contrario (son los
// que prueban el recorte a horario laboral).
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
    // 10:00-10:02 local (Caracas) = 14:00-14:02 UTC, dentro de horario.
    const messages = [
      incoming(1, "2026-08-12T14:00:00.000Z"),
      outgoingBy(1, "2026-08-12T14:02:00.000Z", AGENT), // 120s de hueco
    ]
    const stats = aggregateAgentStats(messages, [], AGENT, date)
    expect(stats.velocidadRespuestaSegundos).toBe(120)
  })

  it("does not create a second sample for consecutive outgoing messages from the same agent", () => {
    const messages = [
      incoming(1, "2026-08-12T14:00:00.000Z"),
      outgoingBy(1, "2026-08-12T14:01:00.000Z", AGENT), // 60s
      outgoingBy(1, "2026-08-12T14:01:30.000Z", AGENT), // parte 2 de la misma respuesta, no cuenta
    ]
    const stats = aggregateAgentStats(messages, [], AGENT, date)
    expect(stats.velocidadRespuestaSegundos).toBe(60)
  })

  it("does not sample a reply that isn't immediately preceded by a customer message", () => {
    const messages = [
      outgoingBy(1, "2026-08-12T13:00:00.000Z", OTHER_AGENT), // otro asesor contestó antes
      outgoingBy(1, "2026-08-12T14:00:00.000Z", AGENT), // este asesor retoma, no hay hueco que medir
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
      incoming(1, "2026-08-12T14:00:00.000Z"),
      outgoingBy(1, "2026-08-12T14:05:00.000Z", AGENT),
      incoming(2, "2026-08-12T15:00:00.000Z"), // nunca contestada
    ]
    const stats = aggregateAgentStats(messages, conversations, AGENT, date)
    expect(stats.tasaRespuesta).toBe(50)
  })

  it("excludes conversations not assigned to the agent from tasaRespuesta", () => {
    const conversations: AgentStatsConversationInput[] = [{ id: 1, assigneeId: OTHER_AGENT }]
    const messages = [incoming(1, "2026-08-12T14:00:00.000Z")]
    const stats = aggregateAgentStats(messages, conversations, AGENT, date)
    expect(stats.tasaRespuesta).toBeNull()
  })

  it("adds the gap of an unanswered assigned conversation to tiempoMuertoSegundos, clipped to now", () => {
    const conversations: AgentStatsConversationInput[] = [{ id: 1, assigneeId: AGENT }]
    const messages = [incoming(1, "2026-08-12T14:00:00.000Z")] // 10:00 local
    const now = new Date("2026-08-12T14:10:00.000Z") // 10:10 local, 600s sin contestar, todo en horario
    const stats = aggregateAgentStats(messages, conversations, AGENT, date, now)
    expect(stats.tiempoMuertoSegundos).toBe(600)
  })

  it("clips pending dead time to the start of today AND to work hours", () => {
    const conversations: AgentStatsConversationInput[] = [{ id: 1, assigneeId: AGENT }]
    // Mensaje sin contestar desde el LUNES (dos días antes de "hoy" = miércoles).
    const messages = [incoming(1, "2026-08-10T14:00:00.000Z")]
    // "Ahora" = miércoles 09:00 local (13:00 UTC) — una hora antes de que
    // termine de intersecar con el horario laboral (empieza 8:30am).
    const now = new Date("2026-08-12T13:00:00.000Z")
    const stats = aggregateAgentStats(messages, conversations, AGENT, date, now)
    // Recortado primero a "hoy" (00:00-09:00 local miércoles), y de eso solo
    // la porción 8:30-9:00 cae en horario laboral: 30 minutos.
    expect(stats.tiempoMuertoSegundos).toBe(1800)
  })

  it("does not add pending dead time for a conversation already answered", () => {
    const conversations: AgentStatsConversationInput[] = [{ id: 1, assigneeId: AGENT }]
    const messages = [
      incoming(1, "2026-08-12T14:00:00.000Z"),
      outgoingBy(1, "2026-08-12T14:01:00.000Z", AGENT),
    ]
    const now = new Date("2026-08-12T16:00:00.000Z")
    const stats = aggregateAgentStats(messages, conversations, AGENT, date, now)
    expect(stats.tiempoMuertoSegundos).toBe(60) // solo el hueco ya cerrado, nada pendiente
  })

  it("separates today's and yesterday's samples correctly", () => {
    const messages = [
      incoming(1, "2026-08-11T14:00:00.000Z"), // martes (ayer), 10:00 local
      outgoingBy(1, "2026-08-11T14:01:00.000Z", AGENT), // ayer, 60s
      incoming(2, "2026-08-12T14:00:00.000Z"), // miércoles (hoy), 10:00 local
      outgoingBy(2, "2026-08-12T14:05:00.000Z", AGENT), // hoy, 300s
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

  describe("recorte a horario laboral", () => {
    // Estos tres casos cruzan de un día calendario a otro, así que ya NO
    // cuentan para Velocidad (ver "sameDay" más abajo) — pero el recorte a
    // horario laboral en sí se sigue probando igual, vía Tiempo muerto, que
    // sí suma estos huecos completos a propósito.
    it("does not count a gap that falls entirely outside working hours", () => {
      // Entrante miércoles 11pm (fuera, cierra 7:30pm) -> saliente jueves
      // 8am (fuera, abre 8:30am). Ningún minuto del hueco cae en horario.
      const messages = [
        incoming(1, "2026-08-13T03:00:00.000Z"), // mié 23:00 local
        outgoingBy(1, "2026-08-13T12:00:00.000Z", AGENT), // jue 08:00 local
      ]
      const stats = aggregateAgentStats(messages, [], AGENT, "2026-08-13")
      expect(stats.tiempoMuertoSegundos).toBe(0)
      expect(stats.velocidadRespuestaSegundos).toBeNull() // cruza de día, no entra al promedio
    })

    it("only counts the portion of an overnight gap that overlaps working hours, across two calendar days", () => {
      // Entrante miércoles 7pm (30 min antes de cerrar) -> saliente jueves
      // 9am (30 min después de abrir). Cuenta 30+30 = 60 min, no las ~14h
      // reales de diferencia.
      const messages = [
        incoming(1, "2026-08-12T23:00:00.000Z"), // mié 19:00 local
        outgoingBy(1, "2026-08-13T13:00:00.000Z", AGENT), // jue 09:00 local
      ]
      const stats = aggregateAgentStats(messages, [], AGENT, "2026-08-13")
      expect(stats.tiempoMuertoSegundos).toBe(3600)
      expect(stats.velocidadRespuestaSegundos).toBeNull()
    })

    it("uses the shorter Sunday window when a gap crosses from Saturday into Sunday", () => {
      // Sábado 7pm (30 min antes de cerrar, horario lun-sáb) -> domingo
      // 10am (1h después de abrir, horario domingo 9am-4:30pm).
      const messages = [
        incoming(1, "2026-08-15T23:00:00.000Z"), // sáb 19:00 local
        outgoingBy(1, "2026-08-16T14:00:00.000Z", AGENT), // dom 10:00 local
      ]
      const stats = aggregateAgentStats(messages, [], AGENT, "2026-08-16")
      expect(stats.tiempoMuertoSegundos).toBe(1800 + 3600)
      expect(stats.velocidadRespuestaSegundos).toBeNull()
    })
  })

  describe("Velocidad: promedio, no acumulado", () => {
    it("averages multiple same-day samples instead of summing them", () => {
      const messages = [
        incoming(1, "2026-08-12T14:00:00.000Z"), // 10:00 local
        outgoingBy(1, "2026-08-12T14:01:00.000Z", AGENT), // +60s
        incoming(2, "2026-08-12T15:00:00.000Z"), // 11:00 local
        outgoingBy(2, "2026-08-12T15:03:00.000Z", AGENT), // +180s
      ]
      const stats = aggregateAgentStats(messages, [], AGENT, date)
      // Promedio de 60 y 180 = 120 — si fuera acumulado, sería 240.
      expect(stats.velocidadRespuestaSegundos).toBe(120)
    })

    it("excludes a multi-day backlog reply from Velocidad without excluding it from Tiempo muerto", () => {
      const messages = [
        // Muestra normal de hoy: 60s.
        incoming(1, "2026-08-12T14:00:00.000Z"),
        outgoingBy(1, "2026-08-12T14:01:00.000Z", AGENT),
        // Backlog de días: entrante lunes, contestado hoy (miércoles) —
        // sample enorme que NO debe inflar el promedio de Velocidad.
        incoming(2, "2026-08-10T14:00:00.000Z"), // lunes
        outgoingBy(2, "2026-08-12T14:00:00.000Z", AGENT), // miércoles, misma ventana "hoy"
      ]
      const stats = aggregateAgentStats(messages, [], AGENT, date)
      // Solo la muestra del mismo día (60s) entra al promedio.
      expect(stats.velocidadRespuestaSegundos).toBe(60)
      // Pero el hueco del backlog sí se suma completo a Tiempo muerto.
      expect(stats.tiempoMuertoSegundos).toBeGreaterThan(3600)
    })
  })
})
