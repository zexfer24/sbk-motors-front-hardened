// ============================================================================
// Lectura directa desde el Postgres de Chatwoot (rol `sbk_front_ro`, mismo
// pool que lib/api/chatwoot-db.ts) para las estadísticas del Panel —
// KPIs y actividad por hora — como vía rápida opcional para
// lib/chatwoot-stats.ts.
//
// Mismo motivo que chatwoot-db.ts: la API de Chatwoot paga el costo de
// serialización de Rails por página/conversación. Acá el ahorro es mayor
// para la actividad por hora, que hoy hace 1 llamada de listado + 1 llamada
// a /messages POR CADA conversación activa del día — con esta vía es una
// sola consulta con JOIN, sin fan-out.
//
// SOLO LECTURA. Nada de esto escribe nada — sigue siendo el rol
// `sbk_front_ro`, que solo tiene SELECT sobre conversations y messages.
//
// Devuelve `null` si esta vía no está disponible (variables CHATWOOT_DB_*
// sin configurar) o si la consulta falló — nunca lanza. Ese `null` es la
// señal para que lib/chatwoot-stats.ts caiga al barrido por API de siempre,
// sin loguear nada raro (el log de la consulta fallida ya lo hace
// queryChatwootDb en chatwoot-db.ts).
// ============================================================================

import type { QueryResultRow } from "pg"
import { queryChatwootDb } from "@/lib/api/chatwoot-db"

interface KpiConversationRow extends QueryResultRow {
  id: number
  contact_id: number | null
  created_at: string
}

// Mismo truco que CONVERSATIONS_QUERY en chatwoot-db.ts: to_char formatea a
// texto ISO-8601 UTC en la propia consulta para no dejar que el driver de
// pg (o Node) interprete la columna `timestamp without time zone` como hora
// local — la columna guarda UTC pero su tipo no lo dice.
const KPI_CONVERSATIONS_QUERY = `
  SELECT
    id,
    contact_id,
    to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
  FROM conversations
  WHERE account_id = $1
`

export interface KpiConversationRecord {
  createdAtIso: string
  contactId: number
}

export async function fetchKpiConversationsFromDb(accountId: string): Promise<KpiConversationRecord[] | null> {
  const rows = await queryChatwootDb<KpiConversationRow>(KPI_CONVERSATIONS_QUERY, [Number(accountId)])
  if (!rows) return null

  return rows.map((row) => ({
    createdAtIso: row.created_at,
    contactId: row.contact_id != null ? Number(row.contact_id) : 0,
  }))
}

interface HourlyMessageRow extends QueryResultRow {
  message_type: number
  created_at: string
}

const HOURLY_MESSAGES_QUERY = `
  SELECT
    m.message_type,
    to_char(m.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
  FROM messages m
  JOIN conversations c ON c.id = m.conversation_id
  WHERE c.account_id = $1
    AND m.created_at >= $2::timestamp
    AND m.created_at < $3::timestamp
`

export interface HourlyMessageRecord {
  messageType: number
  createdAtIso: string
}

// startUtcIso/endUtcIso llegan como ISO con sufijo "Z" (salida de
// caracasOperatingHoursBoundsUtc, vía Date#toISOString). Postgres los recibe
// sin ese sufijo y con cast a ::timestamp — la columna es "sin zona horaria"
// pero guarda UTC, así que comparamos como el valor naive que le corresponde
// en vez de dejar que el driver intente convertir un Date de JS.
function toNaiveUtc(iso: string): string {
  return iso.endsWith("Z") ? iso.slice(0, -1) : iso
}

export async function fetchHourlyMessagesFromDb(
  accountId: string,
  startUtcIso: string,
  endUtcIso: string,
): Promise<HourlyMessageRecord[] | null> {
  const rows = await queryChatwootDb<HourlyMessageRow>(HOURLY_MESSAGES_QUERY, [
    Number(accountId),
    toNaiveUtc(startUtcIso),
    toNaiveUtc(endUtcIso),
  ])
  if (!rows) return null

  return rows.map((row) => ({
    messageType: Number(row.message_type),
    createdAtIso: row.created_at,
  }))
}
