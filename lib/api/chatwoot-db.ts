// ============================================================================
// Lectura directa del listado de conversaciones desde el Postgres de
// Chatwoot (rol de solo lectura `sbk_front_ro`), como vía rápida opcional
// para fetchAndSyncConversations (chatwoot-sync.ts) — ver la NOTA DE
// INCIDENTE de ese archivo, ADDENDUM 3, para el porqué completo.
//
// Resumen: la API de Chatwoot paga ~900ms de CPU en Ruby serializando JSON
// por página de 25 conversaciones (medido en el servidor, 2026-08-11), y
// ese costo no baja aunque se pida con más concurrencia (Chatwoot corre 3
// workers de Puma, GIL de por medio). La misma consulta por SQL directo
// mide ~19ms. Esta vía evita el problema de raíz en vez de solo repartir
// mejor la cola — ver chatwoot-sync.ts para el camino que sí depende de la
// API (pool de concurrencia + resiliencia), que queda como fallback.
//
// SOLO LECTURA, y solo para ESTE listado. Nada de lo que envía mensajes,
// asigna, cierra, marca leído o etiqueta pasa por acá — sigue yendo por
// chatwootFetch (lib/chatwoot/client.ts), el único camino que dispara los
// jobs de Sidekiq que de verdad hacen esas cosas (mandar a WhatsApp,
// notificar, auditar). Un INSERT/UPDATE directo a esta base crearía una
// fila que Chatwoot nunca procesa — por eso el rol `sbk_front_ro` solo
// tiene SELECT, sin excepción, y este archivo no debe ganar ningún otro
// privilegio más adelante.
//
// Si las variables de entorno CHATWOOT_DB_* no están configuradas (p. ej.
// mientras la red de Docker entre este contenedor y el Postgres de
// Chatwoot todavía no está conectada), fetchConversationsFromDb() devuelve
// `null` en silencio — es la señal para que chatwoot-sync.ts caiga a la
// API sin loguear nada raro. Solo se loguea cuando las variables SÍ están
// puestas pero la consulta falla de verdad (timeout, conexión rechazada,
// columna que ya no coincide con el esquema documentado abajo).
// ============================================================================

import { Pool } from "pg"
import type { MappedConversation } from "@/lib/api/chatwoot-sync"

interface ChatwootDbConfig {
  host: string
  port: number
  database: string
  user: string
  password: string
}

let cachedConfig: ChatwootDbConfig | null | undefined

function getDbConfig(): ChatwootDbConfig | null {
  if (cachedConfig !== undefined) return cachedConfig

  const host = process.env.CHATWOOT_DB_HOST
  const port = process.env.CHATWOOT_DB_PORT
  const database = process.env.CHATWOOT_DB_NAME
  const user = process.env.CHATWOOT_DB_USER
  const password = process.env.CHATWOOT_DB_PASSWORD

  if (!host || !port || !database || !user || !password) {
    cachedConfig = null
    return null
  }

  cachedConfig = { host, port: Number(port), database, user, password }
  return cachedConfig
}

// Anclado a globalThis por el mismo motivo que lib/chatwoot/event-bus.ts:
// sobrevive el fast refresh de Turbopack en dev sin abrir un pool nuevo en
// cada recompilación. En producción es un solo proceso, así que esto solo
// evita el problema en dev.
const globalForChatwootDb = globalThis as unknown as { __chatwootDbPool?: Pool }

function getPool(config: ChatwootDbConfig): Pool {
  if (globalForChatwootDb.__chatwootDbPool) return globalForChatwootDb.__chatwootDbPool

  const pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    // Query puntual y frecuente, no un batch — no hace falta un pool
    // grande. El rol ya trae statement_timeout=5s fijado en la propia
    // base como red de seguridad; estos dos son el límite del lado del
    // cliente, más corto a propósito, para no depender solo de esa red.
    max: 5,
    connectionTimeoutMillis: 3_000,
    statement_timeout: 4_000,
    query_timeout: 4_000,
    idleTimeoutMillis: 30_000,
    // Red interna de Docker, sin TLS entre contenedores — mismo patrón
    // que CHATWOOT_URL (http, no https) para el mismo tráfico.
    ssl: false,
  })

  // Un cliente ocioso del pool que se cae (Postgres reiniciando, hipo de
  // red dentro de Docker) emite 'error' de forma asíncrona. Sin este
  // handler, Node trata ese evento sin listener como no capturado y tumba
  // el proceso completo — con esto se loguea y el próximo query simplemente
  // pide un cliente nuevo del pool.
  pool.on("error", (err) => {
    console.error("[chatwoot-db] error en una conexión ociosa del pool de Postgres:", err)
  })

  globalForChatwootDb.__chatwootDbPool = pool
  return pool
}

// enum real de Chatwoot v4.16.2 — app/models/conversation.rb:
// `enum status: { open: 0, resolved: 1, pending: 2, snoozed: 3 }`
const STATUS_BY_CODE: Record<number, string> = {
  0: "open",
  1: "resolved",
  2: "pending",
  3: "snoozed",
}

interface ConversationRow {
  id: number
  status: number
  created_at: string
  labels_raw: string | null
  inbox_id: number | null
  inbox_name: string | null
  contact_name: string | null
  phone: string | null
  assignee_id: number | null
  assignee_name: string | null
  last_message: string | null
  last_message_at: string | null
  unread_count: number
}

// account_id = display_id -> id, NO conversations.id — todas las rutas de
// escritura del front arman /conversations/{id}/... contra la API con el
// id que devuelve el listado, y la API de Chatwoot identifica
// conversaciones por display_id en esa ruta, no por el id interno.
//
// Los timestamps salen ya formateados como texto ISO-8601 UTC (to_char, sin
// tocar zona horaria) en vez de dejar que el driver de pg parsee un
// `timestamp without time zone` a un Date de JS — esa columna guarda UTC
// por decisión del equipo pero no lo dice en su tipo, así que dejar que el
// driver o el proceso de Node lo interprete como hora local sería un bug
// silencioso de varias horas de desfase. Formatear a texto en la propia
// consulta evita el problema de raíz, sin depender de la zona horaria de
// sesión de Postgres ni del proceso de Node.
//
// unread_count: Chatwoot lo calcula (unread_incoming_messages,
// conversation.rb) como mensajes entrantes (message_type = 0) posteriores a
// agent_last_seen_at (o todos si es null), con tope de 10. Contar todos los
// que cumplen y capar con LEAST dan el mismo número que contar hasta 10 —
// nunca hay que distinguir cuál de los dos porque coinciden siempre.
//
// No filtra por inbox_id: el camino por API tampoco lo hace hoy (trae
// conversaciones de TODOS los buzones de la cuenta y resuelve el nombre de
// cada una con listInboxes) — filtrar acá sería un cambio de comportamiento,
// no un reemplazo neutral.
const CONVERSATIONS_QUERY = `
  SELECT
    c.display_id AS id,
    c.status AS status,
    to_char(c.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
    c.cached_label_list AS labels_raw,
    c.inbox_id AS inbox_id,
    ib.name AS inbox_name,
    ct.name AS contact_name,
    ct.phone_number AS phone,
    c.assignee_id AS assignee_id,
    u.name AS assignee_name,
    lm.content AS last_message,
    to_char(lm.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_message_at,
    COALESCE(uc.unread_count, 0)::int AS unread_count
  FROM conversations c
  LEFT JOIN inboxes ib ON ib.id = c.inbox_id
  LEFT JOIN contacts ct ON ct.id = c.contact_id
  LEFT JOIN users u ON u.id = c.assignee_id
  LEFT JOIN LATERAL (
    SELECT m.content, m.created_at
    FROM messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC
    LIMIT 1
  ) lm ON true
  LEFT JOIN LATERAL (
    SELECT LEAST(count(*), 10) AS unread_count
    FROM messages m2
    WHERE m2.conversation_id = c.id
      AND m2.message_type = 0
      AND (c.agent_last_seen_at IS NULL OR m2.created_at > c.agent_last_seen_at)
  ) uc ON true
  WHERE c.account_id = $1
  ORDER BY c.id DESC
`

function mapRow(row: ConversationRow): MappedConversation {
  const assigneeId = row.assignee_id != null ? Number(row.assignee_id) : null
  const inboxId = row.inbox_id != null ? Number(row.inbox_id) : null
  const labels = row.labels_raw
    ? row.labels_raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : []

  return {
    id: String(row.id),
    contactName: row.contact_name ?? "Desconocido",
    phone: row.phone ?? "",
    // No se puede replicar por SQL: en Chatwoot es un método derivado
    // (Contact#avatar_url, Active Storage + firma de blobs de Rails), no
    // una columna. El front ya tolera avatarUrl null (cae al círculo con
    // la inicial) — es una limitación real y consciente de esta vía, no
    // una regresión.
    avatarUrl: null,
    assigneeId,
    assigneeName: assigneeId !== null ? (row.assignee_name ?? "") : null,
    inboxId,
    inboxName: row.inbox_name ?? (inboxId !== null ? `Buzón ${inboxId}` : null),
    lastMessage: row.last_message ?? null,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    unreadCount: row.unread_count,
    status: STATUS_BY_CODE[row.status] ?? "open",
    // No cubre conversaciones asignadas a un AgentBot (columna separada
    // assignee_agent_bot_id, no assignee_id) — aceptable porque el bot de
    // IA está desconectado del inbox hoy. Si se reactiva, esta regla (igual
    // que la del mapper por API) necesita revisarse.
    handledBy: assigneeId !== null ? "human" : "ai",
    online: false,
    typing: false,
    messages: [],
    labels,
  }
}

// Devuelve `null` si esta vía no está disponible o falló — nunca lanza.
// chatwoot-sync.ts trata `null` como "cae a la API", sin excepción.
export async function fetchConversationsFromDb(
  accountId: string,
): Promise<MappedConversation[] | null> {
  const config = getDbConfig()
  if (!config) return null

  try {
    const pool = getPool(config)
    const { rows } = await pool.query<ConversationRow>(CONVERSATIONS_QUERY, [Number(accountId)])
    return rows.map(mapRow)
  } catch (err) {
    console.error(
      "[chatwoot-db] la lectura directa a Postgres falló (timeout, conexión rechazada o esquema distinto al documentado):",
      err,
    )
    return null
  }
}
