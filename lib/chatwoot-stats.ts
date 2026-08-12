// ============================================================================
// Estadísticas del Panel derivadas de Chatwoot — SOLO de servidor.
// ============================================================================
// Esta instancia de Chatwoot no expone su API de Reportes (/reports/* da
// 404 de forma consistente, se probó en vivo) — así que en vez de eso
// contamos a mano a partir de /conversations y /conversations/:id/messages,
// que sí están disponibles. Para una cuenta con pocas conversaciones esto
// es barato; si el negocio crece mucho, esto debería migrar a la API de
// Reportes si algún día se habilita, o a un job que agregue estos números
// en Supabase en vez de calcularlos en cada request.
//
// Como con el listado de conversaciones (ver lib/api/chatwoot-db.ts), cada
// función intenta primero leer directo del Postgres de Chatwoot
// (lib/api/chatwoot-stats-db.ts) — evita el costo de serialización de Rails
// y, en el caso de la actividad por hora, todo el fan-out de una llamada a
// /messages por conversación activa. Si esa vía no está disponible o falla,
// cae sola al barrido por API de siempre, sin loguear nada raro.
// ============================================================================

import { chatwootFetch, getChatwootConfig } from "@/lib/chatwoot/client"
import { fetchHourlyMessagesFromDb, fetchKpiConversationsFromDb } from "@/lib/api/chatwoot-stats-db"
import {
  caracasDayBoundsUtc,
  caracasOperatingHourIndex,
  caracasOperatingHoursBoundsUtc,
  shiftDateStr,
  OPERATING_HOUR_END,
  OPERATING_HOUR_START,
} from "@/lib/caracas-time"

interface RawConversation {
  id: number
  createdAtIso: string
  lastActivityIso: string
  contactId: number
}

const MAX_PAGES = 20

async function fetchAllRawConversations(): Promise<RawConversation[] | null> {
  if (!getChatwootConfig()) return null

  try {
    const all: Record<string, unknown>[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      const data = await chatwootFetch<{ data: { payload: Record<string, unknown>[] } }>(
        `/conversations?status=all&page=${page}`,
        { cache: "no-store" },
      )
      const pagePayload = data.data.payload
      all.push(...pagePayload)
      if (pagePayload.length === 0 || pagePayload.length < 25) break
    }

    return all.map((raw) => {
      const meta = (raw.meta as Record<string, unknown>) ?? {}
      const sender = (meta.sender as Record<string, unknown>) ?? {}
      return {
        id: Number(raw.id) || 0,
        createdAtIso: new Date((Number(raw.created_at) || 0) * 1000).toISOString(),
        lastActivityIso: new Date((Number(raw.last_activity_at) || 0) * 1000).toISOString(),
        contactId: Number(sender.id) || 0,
      }
    })
  } catch {
    return null
  }
}

export interface ChatwootKpiStats {
  available: boolean
  newChatsToday: number
  newChatsYesterday: number
  totalCustomers: number
  totalCustomersYesterday: number
}

const EMPTY_KPI_STATS: ChatwootKpiStats = {
  available: false,
  newChatsToday: 0,
  newChatsYesterday: 0,
  totalCustomers: 0,
  totalCustomersYesterday: 0,
}

export interface KpiConversationInput {
  createdAtIso: string
  contactId: number
}

/**
 * Agregación pura, sin I/O — usada tanto por la vía Postgres directo como
 * por el barrido de la API de Chatwoot (fetchAllRawConversations), que solo
 * difieren en de dónde salen las filas, no en cómo se cuentan.
 */
export function aggregateKpiStats(conversations: KpiConversationInput[], date: string): ChatwootKpiStats {
  const todayBounds = caracasDayBoundsUtc(date)
  const yesterdayBounds = caracasDayBoundsUtc(shiftDateStr(date, -1))

  const newChatsToday = conversations.filter(
    (c) => c.createdAtIso >= todayBounds.startUtc && c.createdAtIso < todayBounds.endUtc,
  ).length
  const newChatsYesterday = conversations.filter(
    (c) => c.createdAtIso >= yesterdayBounds.startUtc && c.createdAtIso < yesterdayBounds.endUtc,
  ).length

  // "cliente desde" = la conversación más antigua de ese contacto.
  const firstSeenByContact = new Map<number, string>()
  for (const c of conversations) {
    if (!c.contactId) continue
    const prev = firstSeenByContact.get(c.contactId)
    if (!prev || c.createdAtIso < prev) firstSeenByContact.set(c.contactId, c.createdAtIso)
  }

  // "Clientes totales" es acumulado histórico hasta el final del día que se
  // está viendo — así un día pasado muestra cuántos clientes había hasta
  // entonces, no el total de hoy.
  const totalCustomers = Array.from(firstSeenByContact.values()).filter(
    (iso) => iso < todayBounds.endUtc,
  ).length
  const totalCustomersYesterday = Array.from(firstSeenByContact.values()).filter(
    (iso) => iso < todayBounds.startUtc,
  ).length

  return { available: true, newChatsToday, newChatsYesterday, totalCustomers, totalCustomersYesterday }
}

/** `date` es el día (YYYY-MM-DD, Caracas) que el Panel está resumiendo — no necesariamente hoy. */
export async function getChatwootKpiStats(date: string): Promise<ChatwootKpiStats> {
  const config = getChatwootConfig()
  if (config) {
    const dbConversations = await fetchKpiConversationsFromDb(config.accountId)
    if (dbConversations) return aggregateKpiStats(dbConversations, date)
  }

  const conversations = await fetchAllRawConversations()
  if (!conversations) return EMPTY_KPI_STATS
  return aggregateKpiStats(conversations, date)
}

export interface ChatwootHourlyStats {
  available: boolean
  /** mensajes entrantes del cliente por hora */
  chats: number[]
  /** mensajes salientes (asesor o IA) por hora */
  messages: number[]
}

const HOURLY_SLOTS = OPERATING_HOUR_END - OPERATING_HOUR_START

function emptyHourly(available: boolean): ChatwootHourlyStats {
  return { available, chats: new Array(HOURLY_SLOTS).fill(0), messages: new Array(HOURLY_SLOTS).fill(0) }
}

export interface HourlyMessageInput {
  /** 0 = entrante (cliente), 1 = saliente (asesor o IA) — igual que Chatwoot */
  messageType: number
  createdAtIso: string
}

/**
 * Bucketing puro, sin I/O — usado tanto por la vía Postgres directo como
 * por el fan-out a /conversations/:id/messages, que solo difieren en de
 * dónde salen los mensajes, no en cómo se agrupan por hora.
 */
export function bucketHourlyMessages(
  messages: HourlyMessageInput[],
  bounds: { startUtc: string; endUtc: string },
): ChatwootHourlyStats {
  const chats = new Array(HOURLY_SLOTS).fill(0)
  const messageCounts = new Array(HOURLY_SLOTS).fill(0)

  for (const m of messages) {
    // caracasOperatingHourIndex solo mira la hora del día — hay que exigir
    // también que caiga dentro del día que se está resumiendo, si no un
    // mensaje de ayer a las 10am se contaba como de hoy.
    if (m.createdAtIso < bounds.startUtc || m.createdAtIso >= bounds.endUtc) continue
    const idx = caracasOperatingHourIndex(m.createdAtIso)
    if (idx === null) continue
    if (m.messageType === 0) chats[idx] += 1
    else if (m.messageType === 1) messageCounts[idx] += 1
  }

  return { available: true, chats, messages: messageCounts }
}

/** `date` es el día (YYYY-MM-DD, Caracas) que el Panel está resumiendo — no necesariamente hoy. */
export async function getChatwootHourlyStats(date: string): Promise<ChatwootHourlyStats> {
  const bounds = caracasOperatingHoursBoundsUtc(date)

  const config = getChatwootConfig()
  if (config) {
    const dbMessages = await fetchHourlyMessagesFromDb(config.accountId, bounds.startUtc, bounds.endUtc)
    if (dbMessages) return bucketHourlyMessages(dbMessages, bounds)
  }

  const conversations = await fetchAllRawConversations()
  if (!conversations) return emptyHourly(false)

  // Solo vale la pena pedir el historial de mensajes de conversaciones que
  // tuvieron actividad ese día — evita pedirle a Chatwoot el historial
  // completo de conversaciones viejas sin movimiento. Si la última
  // actividad fue antes de que abriera el negocio ese día, no puede haber
  // mensajes dentro de la ventana de atención.
  const activeToday = conversations.filter(
    (c) => c.lastActivityIso >= bounds.startUtc && c.createdAtIso < bounds.endUtc,
  )

  const allMessages: HourlyMessageInput[] = []

  await Promise.all(
    activeToday.map(async (c) => {
      try {
        const data = await chatwootFetch<{ payload: Record<string, unknown>[] }>(
          `/conversations/${c.id}/messages`,
          { cache: "no-store" },
        )
        for (const m of data.payload) {
          allMessages.push({
            messageType: Number(m.message_type),
            createdAtIso: new Date((Number(m.created_at) || 0) * 1000).toISOString(),
          })
        }
      } catch {
        // si falla el historial de una conversación puntual, no bloquea las demás
      }
    }),
  )

  return bucketHourlyMessages(allMessages, bounds)
}
