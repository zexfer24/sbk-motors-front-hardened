// ============================================================================
// Lectura directa desde el Postgres de Chatwoot (rol `sbk_front_ro`, mismo
// pool que lib/api/chatwoot-db.ts) para las métricas por asesor del Centro
// de Control — vía rápida opcional para lib/chatwoot-agent-stats.ts.
//
// SOLO LECTURA. Nada de esto escribe nada. Devuelve `null` si esta vía no
// está disponible (variables CHATWOOT_DB_* sin configurar) o si la consulta
// falló — nunca lanza. queryChatwootDb (chatwoot-db.ts) ya se encarga de
// loguear el fallo real; acá no hace falta duplicarlo.
// ============================================================================

import type { QueryResultRow } from "pg"
import { queryChatwootDb } from "@/lib/api/chatwoot-db"
import type { AgentStatsConversationInput, AgentStatsMessageInput } from "@/lib/chatwoot-agent-stats"

interface AgentConversationRow extends QueryResultRow {
  id: number
  assignee_id: number | null
}

const AGENT_CONVERSATIONS_QUERY = `
  SELECT id, assignee_id
  FROM conversations
  WHERE account_id = $1
`

export async function fetchAgentConversationsFromDb(
  accountId: string,
): Promise<AgentStatsConversationInput[] | null> {
  const rows = await queryChatwootDb<AgentConversationRow>(AGENT_CONVERSATIONS_QUERY, [Number(accountId)])
  if (!rows) return null
  return rows.map((row) => ({
    id: Number(row.id),
    assigneeId: row.assignee_id != null ? Number(row.assignee_id) : null,
  }))
}

interface AgentMessageRow extends QueryResultRow {
  conversation_id: number
  message_type: number
  sender_type: string | null
  sender_id: number | null
  created_at: string
  private: boolean
}

// Acotado a los últimos 3 días (hoy + ayer + margen de huso horario) — igual
// que getChatwootHourlyStats en chatwoot-stats.ts descarta conversaciones
// sin actividad reciente antes de pedir su historial. Sin este corte,
// cargar TODO el historial de mensajes de la cuenta crecería sin límite con
// el tiempo para calcular algo que solo necesita dos días.
const LOOKBACK_DAYS = 3

const AGENT_MESSAGES_QUERY = `
  SELECT
    m.conversation_id,
    m.message_type,
    m.sender_type,
    m.sender_id,
    to_char(m.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
    m.private
  FROM messages m
  JOIN conversations c ON c.id = m.conversation_id
  WHERE c.account_id = $1
    AND m.created_at >= $2::timestamp
`

export async function fetchAgentMessagesFromDb(accountId: string): Promise<AgentStatsMessageInput[] | null> {
  // Naive-UTC, mismo motivo que toNaiveUtc en chatwoot-stats-db.ts: la
  // columna guarda UTC pero su tipo no lo dice, así que se compara como el
  // valor naive que le corresponde en vez de dejar que el driver convierta.
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, -1)

  const rows = await queryChatwootDb<AgentMessageRow>(AGENT_MESSAGES_QUERY, [Number(accountId), cutoff])
  if (!rows) return null

  return rows.map((row) => ({
    conversationId: Number(row.conversation_id),
    messageType: Number(row.message_type),
    senderType: row.sender_type,
    senderId: row.sender_id != null ? Number(row.sender_id) : null,
    createdAtIso: row.created_at,
    private: Boolean(row.private),
  }))
}
