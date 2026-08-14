// ============================================================================
// Métricas por asesor del Centro de Control — derivadas de mensajes y
// conversaciones crudos de Chatwoot, mismo motivo que lib/chatwoot-stats.ts:
// esta instancia no expone su API de Reportes (/reports/* da 404,
// confirmado en vivo), así que se cuenta a mano a partir de /conversations
// y /conversations/:id/messages (o del Postgres directo, más rápido —
// ver lib/api/chatwoot-agent-stats-db.ts).
// ============================================================================
//
// Definiciones (fijadas explícitamente aquí, no las inventa quien lee el
// resultado):
//
// - "Chats respondidos" (hoy/ayer): conversaciones DISTINTAS donde este
//   asesor mandó al menos un mensaje saliente (no privado, no de otro
//   asesor/bot) ese día. Se cuenta por AUTOR real del mensaje
//   (sender_type='User', sender_id=agentId) — no por quién tiene la
//   conversación asignada ahora mismo, porque la asignación puede cambiar
//   después de que el asesor ya respondió.
//
// - "Velocidad de respuesta": de cada mensaje saliente de este asesor, se
//   mira el mensaje INMEDIATO ANTERIOR en la misma conversación (por
//   tiempo) — si ese anterior es un mensaje entrante del cliente (no
//   privado), la diferencia de tiempo es una "muestra", PERO solo cuenta el
//   tiempo que cae dentro del horario laboral real del negocio (ver
//   workHoursOverlapMs más abajo) — un mensaje que llega a las 11pm y se
//   contesta a las 8am no debe sumar 9 horas de "hueco" si el negocio no
//   estaba operando en el medio. El PROMEDIO (no la suma) de esas muestras
//   (ya recortadas) cuyo mensaje saliente cae en la ventana (hoy/ayer) es la
//   velocidad de esa ventana. Una respuesta partida en varios mensajes
//   seguidos del mismo asesor no genera una segunda muestra — ya se contó
//   en el primero de esa tanda.
//
//   Además, una muestra solo entra al promedio de Velocidad si el mensaje
//   entrante y la respuesta caen en el MISMO día calendario (Caracas) — si
//   un asesor por fin contesta un mensaje que llevaba 3 días esperando, ese
//   hueco de varios días infla artificialmente el promedio (una sola
//   muestra enorme lo domina y el número deja de reflejar la velocidad
//   típica). Ese caso de todos modos se sigue contando completo en "Tiempo
//   muerto" (ver más abajo) — ahí sí se quiere el total acumulado, acá se
//   quiere el promedio de respuestas normales del día.
//
// - "Tasa de respuesta": de las conversaciones ASIGNADAS a este asesor que
//   recibieron al menos un mensaje entrante en la ventana, qué % recibió
//   al menos una respuesta suya (no necesariamente la inmediata siguiente)
//   en esa misma ventana. No depende de duración, no lo toca el recorte a
//   horario laboral.
//
// - "Tiempo muerto" (hoy): suma en segundos de dos cosas, ambas recortadas
//   a horario laboral real (lunes a sábado 8:30am-7:30pm, domingo
//   9:00am-4:30pm, Caracas — ver caracasWorkHoursBoundsUtc) —
//     1) todas las "muestras" de velocidad de respuesta de hoy, ya
//        recortadas como se explica arriba.
//     2) para cada conversación ASIGNADA a este asesor cuyo último mensaje
//        (al momento de pedir el reporte) es un entrante todavía sin
//        contestar, el tiempo transcurrido desde ese mensaje hasta ahora,
//        recortado primero a la porción que cae dentro de hoy (si el
//        mensaje llegó ayer y sigue sin contestar, solo se cuenta desde que
//        empezó hoy — así no se infla el número por algo que ya venía de
//        antes) y DESPUÉS a horario laboral dentro de esa porción.
//   "Ayer" es una aproximación más simple, a propósito: solo la parte 1 (los
//   huecos que se CERRARON ese día). No hay forma barata de reconstruir,
//   desde hoy, qué seguía pendiente exactamente al cierre de ayer.
// ============================================================================

import { caracasDateStr, caracasDayBoundsUtc, caracasWorkHoursBoundsUtc, shiftDateStr } from "@/lib/caracas-time"
import { getChatwootConfig } from "@/lib/chatwoot/client"
import {
  fetchAgentMessagesFromDb,
  fetchAgentConversationsFromDb,
} from "@/lib/api/chatwoot-agent-stats-db"

export interface AgentStatsMessageInput {
  conversationId: number
  /** 0 entrante, 1 saliente, 2 actividad, 3 plantilla — igual que Chatwoot (message_type enum). */
  messageType: number
  /** Polimórfico de Chatwoot: 'User' | 'Contact' | 'AgentBot' | 'Captain::Assistant' | null. */
  senderType: string | null
  senderId: number | null
  createdAtIso: string
  private: boolean
}

export interface AgentStatsConversationInput {
  id: number
  assigneeId: number | null
}

export interface AgentDailyStats {
  available: boolean
  chatsRespondidos: number
  chatsRespondidosAyer: number
  velocidadRespuestaSegundos: number | null
  velocidadRespuestaSegundosAyer: number | null
  tasaRespuesta: number | null
  tasaRespuestaAyer: number | null
  tiempoMuertoSegundos: number
  tiempoMuertoSegundosAyer: number
}

export const EMPTY_AGENT_STATS: AgentDailyStats = {
  available: false,
  chatsRespondidos: 0,
  chatsRespondidosAyer: 0,
  velocidadRespuestaSegundos: null,
  velocidadRespuestaSegundosAyer: null,
  tasaRespuesta: null,
  tasaRespuestaAyer: null,
  tiempoMuertoSegundos: 0,
  tiempoMuertoSegundosAyer: 0,
}

const OUTGOING_TYPES = new Set([1, 3])

function isAgentOutgoing(m: AgentStatsMessageInput, agentId: number): boolean {
  return OUTGOING_TYPES.has(m.messageType) && !m.private && m.senderType === "User" && m.senderId === agentId
}

function isCustomerIncoming(m: AgentStatsMessageInput): boolean {
  return m.messageType === 0 && !m.private
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function sortByTime(msgs: AgentStatsMessageInput[]): AgentStatsMessageInput[] {
  return [...msgs].sort((a, b) => new Date(a.createdAtIso).getTime() - new Date(b.createdAtIso).getTime())
}

// Cuánto de [rangeStartMs, rangeEndMs) cae dentro del horario laboral real
// del negocio — recorre cada día calendario (Caracas) que el rango toca,
// porque un hueco de la noche del sábado a la mañana del domingo pasa por
// DOS horarios distintos (sábado termina 7:30pm, domingo empieza 9am); mirar
// un solo día no alcanza. Techo de 14 días de seguridad: un hueco real de
// esta app nunca debería cubrir tantos, evita un loop indefinido si algo
// raro pasa con las fechas de entrada.
function workHoursOverlapMs(rangeStartMs: number, rangeEndMs: number): number {
  if (rangeEndMs <= rangeStartMs) return 0
  let total = 0
  let cursor = caracasDateStr(new Date(rangeStartMs))
  const lastDay = caracasDateStr(new Date(rangeEndMs - 1))
  for (let i = 0; i < 14; i++) {
    const bounds = caracasWorkHoursBoundsUtc(cursor)
    const overlapStart = Math.max(rangeStartMs, new Date(bounds.startUtc).getTime())
    const overlapEnd = Math.min(rangeEndMs, new Date(bounds.endUtc).getTime())
    if (overlapEnd > overlapStart) total += overlapEnd - overlapStart
    if (cursor === lastDay) break
    cursor = shiftDateStr(cursor, 1)
  }
  return total
}

interface ResponseSample {
  conversationId: number
  outgoingAtIso: string
  gapSeconds: number
  /** true si el entrante y el saliente caen en el mismo día calendario (Caracas) — ver Velocidad de respuesta arriba. */
  sameDay: boolean
}

/**
 * Agregación pura, sin I/O — usada tanto por la vía Postgres directo como
 * por el barrido de la API de Chatwoot, que solo difieren en de dónde salen
 * las filas, no en cómo se calculan las métricas.
 */
export function aggregateAgentStats(
  messages: AgentStatsMessageInput[],
  conversations: AgentStatsConversationInput[],
  agentId: number,
  date: string,
  now: Date = new Date(),
): AgentDailyStats {
  const todayBounds = caracasDayBoundsUtc(date)
  const yesterdayBounds = caracasDayBoundsUtc(shiftDateStr(date, -1))

  const messagesByConversation = new Map<number, AgentStatsMessageInput[]>()
  for (const m of messages) {
    const list = messagesByConversation.get(m.conversationId) ?? []
    list.push(m)
    messagesByConversation.set(m.conversationId, list)
  }

  const samples: ResponseSample[] = []
  for (const [conversationId, msgs] of messagesByConversation) {
    const sorted = sortByTime(msgs)
    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i]
      if (!isAgentOutgoing(current, agentId)) continue
      const prev = sorted[i - 1]
      if (!isCustomerIncoming(prev)) continue
      const prevMs = new Date(prev.createdAtIso).getTime()
      const currentMs = new Date(current.createdAtIso).getTime()
      if (currentMs < prevMs) continue
      // Solo cuenta el tiempo dentro de horario laboral — ver el comentario
      // grande de arriba y workHoursOverlapMs.
      const gapSeconds = workHoursOverlapMs(prevMs, currentMs) / 1000
      const sameDay = caracasDateStr(new Date(prevMs)) === caracasDateStr(new Date(currentMs))
      samples.push({ conversationId, outgoingAtIso: current.createdAtIso, gapSeconds, sameDay })
    }
  }

  const inBounds = (iso: string, bounds: { startUtc: string; endUtc: string }) =>
    iso >= bounds.startUtc && iso < bounds.endUtc

  const samplesToday = samples.filter((s) => inBounds(s.outgoingAtIso, todayBounds))
  const samplesYesterday = samples.filter((s) => inBounds(s.outgoingAtIso, yesterdayBounds))

  function respondedConversations(bounds: { startUtc: string; endUtc: string }): Set<number> {
    const set = new Set<number>()
    for (const m of messages) {
      if (!isAgentOutgoing(m, agentId)) continue
      if (!inBounds(m.createdAtIso, bounds)) continue
      set.add(m.conversationId)
    }
    return set
  }
  const respondedToday = respondedConversations(todayBounds)
  const respondedYesterday = respondedConversations(yesterdayBounds)

  const assignedIds = new Set(conversations.filter((c) => c.assigneeId === agentId).map((c) => c.id))

  function responseRate(bounds: { startUtc: string; endUtc: string }, responded: Set<number>): number | null {
    const withIncoming = new Set<number>()
    for (const m of messages) {
      if (!isCustomerIncoming(m)) continue
      if (!assignedIds.has(m.conversationId)) continue
      if (!inBounds(m.createdAtIso, bounds)) continue
      withIncoming.add(m.conversationId)
    }
    if (withIncoming.size === 0) return null
    let answered = 0
    for (const id of withIncoming) if (responded.has(id)) answered++
    return Math.round((answered / withIncoming.size) * 1000) / 10
  }

  let pendingGapSeconds = 0
  for (const conversationId of assignedIds) {
    const msgs = messagesByConversation.get(conversationId)
    if (!msgs || msgs.length === 0) continue
    const last = sortByTime(msgs)[msgs.length - 1]
    if (!isCustomerIncoming(last)) continue
    const lastAt = new Date(last.createdAtIso).getTime()
    // Primero se recorta a "hoy" (no inflar con un pendiente que ya venía
    // de antes), después a horario laboral dentro de esa porción.
    const clippedStart = Math.max(lastAt, new Date(todayBounds.startUtc).getTime())
    const clippedEnd = Math.min(now.getTime(), new Date(todayBounds.endUtc).getTime())
    if (clippedEnd > clippedStart) pendingGapSeconds += workHoursOverlapMs(clippedStart, clippedEnd) / 1000
  }

  // Tiempo muerto SÍ quiere el total acumulado (incluye respuestas a
  // backlog de varios días, a propósito) — por eso closedGaps* usa TODAS
  // las muestras, sin el filtro sameDay que sí aplica a Velocidad.
  const closedGapsToday = samplesToday.reduce((sum, s) => sum + s.gapSeconds, 0)
  const closedGapsYesterday = samplesYesterday.reduce((sum, s) => sum + s.gapSeconds, 0)

  return {
    available: true,
    chatsRespondidos: respondedToday.size,
    chatsRespondidosAyer: respondedYesterday.size,
    velocidadRespuestaSegundos: average(samplesToday.filter((s) => s.sameDay).map((s) => s.gapSeconds)),
    velocidadRespuestaSegundosAyer: average(samplesYesterday.filter((s) => s.sameDay).map((s) => s.gapSeconds)),
    tasaRespuesta: responseRate(todayBounds, respondedToday),
    tasaRespuestaAyer: responseRate(yesterdayBounds, respondedYesterday),
    tiempoMuertoSegundos: closedGapsToday + pendingGapSeconds,
    tiempoMuertoSegundosAyer: closedGapsYesterday,
  }
}

// ----------------------------------------------------------------------
// Orquestación (I/O) — intenta Postgres directo primero (rápido, ver
// chatwoot-agent-stats-db.ts), cae a la API de Chatwoot si no está
// disponible o falla. Mismo contrato que getChatwootKpiStats en
// chatwoot-stats.ts.
// ----------------------------------------------------------------------

async function fetchAllRawForAgentStats(): Promise<{
  messages: AgentStatsMessageInput[]
  conversations: AgentStatsConversationInput[]
} | null> {
  const config = getChatwootConfig()
  if (!config) return null

  // Solo hace falta el historial de conversaciones con actividad reciente
  // (últimas ~48h cubre hoy+ayer con margen) — pedir el historial completo
  // de TODA conversación que exista sería carísimo sin necesidad.
  try {
    const { chatwootFetch } = await import("@/lib/chatwoot/client")
    const conversations: AgentStatsConversationInput[] = []
    const recentConversationIds: number[] = []
    for (let page = 1; page <= 20; page++) {
      const data = await chatwootFetch<{
        data: { payload: Record<string, unknown>[] }
      }>(`/conversations?status=all&page=${page}`, { cache: "no-store" })
      const batch = data.data.payload
      if (batch.length === 0) break
      for (const raw of batch) {
        const id = Number(raw.id) || 0
        const meta = (raw.meta as Record<string, unknown>) ?? {}
        const assignee = meta.assignee as Record<string, unknown> | null | undefined
        conversations.push({ id, assigneeId: assignee ? Number(assignee.id) : null })
        const lastActivityMs = (Number(raw.last_activity_at) || 0) * 1000
        // ~48h de margen (hoy + ayer + huso horario) — ver el mismo criterio
        // en getChatwootHourlyStats (chatwoot-stats.ts).
        if (Date.now() - lastActivityMs < 48 * 60 * 60 * 1000) recentConversationIds.push(id)
      }
      if (batch.length < 25) break
    }

    const messages: AgentStatsMessageInput[] = []
    await Promise.all(
      recentConversationIds.map(async (id) => {
        try {
          const data = await chatwootFetch<{ payload: Record<string, unknown>[] }>(
            `/conversations/${id}/messages`,
            { cache: "no-store" },
          )
          for (const m of data.payload) {
            messages.push({
              conversationId: id,
              messageType: Number(m.message_type),
              senderType: typeof m.sender_type === "string" ? m.sender_type : null,
              senderId: m.sender_id != null ? Number(m.sender_id) : null,
              createdAtIso: new Date((Number(m.created_at) || 0) * 1000).toISOString(),
              private: Boolean(m.private),
            })
          }
        } catch {
          // si falla el historial de una conversación puntual, no bloquea las demás
        }
      }),
    )

    return { conversations, messages }
  } catch {
    return null
  }
}

interface RawAgentStatsData {
  messages: AgentStatsMessageInput[]
  conversations: AgentStatsConversationInput[]
}

async function fetchRawAgentStatsData(): Promise<RawAgentStatsData | null> {
  const config = getChatwootConfig()
  if (config) {
    const [dbMessages, dbConversations] = await Promise.all([
      fetchAgentMessagesFromDb(config.accountId),
      fetchAgentConversationsFromDb(config.accountId),
    ])
    if (dbMessages && dbConversations) return { messages: dbMessages, conversations: dbConversations }
  }
  return fetchAllRawForAgentStats()
}

// Un solo fetch de conversaciones+mensajes cubre a TODOS los asesores del
// reporte — pedirlo una vez por asesor multiplicaría por 4 (o los que sean)
// la carga contra Chatwoot para calcular exactamente los mismos datos
// crudos, mismo motivo que el resto de este módulo evita fan-out
// innecesario. `date` es el día (YYYY-MM-DD, Caracas) que el reporte está
// resumiendo — no necesariamente hoy.
export async function getAgentStatsForAll(
  agentIds: number[],
  date: string,
): Promise<Map<number, AgentDailyStats>> {
  const raw = await fetchRawAgentStatsData()
  const result = new Map<number, AgentDailyStats>()
  for (const id of agentIds) {
    result.set(id, raw ? aggregateAgentStats(raw.messages, raw.conversations, id, date) : EMPTY_AGENT_STATS)
  }
  return result
}

export async function getAgentStats(agentId: number, date: string): Promise<AgentDailyStats> {
  const map = await getAgentStatsForAll([agentId], date)
  return map.get(agentId) ?? EMPTY_AGENT_STATS
}
