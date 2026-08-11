// ============================================================================
// Puente compartido entre /api/chatwoot/conversations y /api/contacts.
// Ambas rutas necesitan la misma respuesta de Chatwoot: la primera para
// listar conversaciones, la segunda para saber si la API responde de
// verdad ahora mismo (no solo si CHATWOOT_URL/TOKEN/ACCOUNT_ID están
// configuradas) y para sincronizar los contactos del CRM.
// ============================================================================

import { chatwootFetch } from "@/lib/chatwoot/client"
import { upsertContactFromChatwoot } from "@/lib/api/contacts-demo-store"
import { listInboxes } from "@/lib/chatwoot/inboxes"

export function mapChatwootConversation(
  raw: Record<string, unknown>,
  inboxNames: Map<number, string>,
) {
  const meta = (raw.meta as Record<string, unknown>) ?? {}
  const sender = (meta.sender as Record<string, unknown>) ?? {}
  const assignee = meta.assignee as Record<string, unknown> | null | undefined
  const lastMsg = (
    Array.isArray(raw.messages) && raw.messages.length > 0
      ? (raw.messages[raw.messages.length - 1] as Record<string, unknown>)
      : null
  ) as Record<string, unknown> | null
  const inboxId = raw.inbox_id != null ? Number(raw.inbox_id) : null

  return {
    id: String(raw.id ?? ""),
    contactName: String(sender.name ?? "Desconocido"),
    phone: String(sender.phone_number ?? ""),
    avatarUrl: sender.thumbnail ? String(sender.thumbnail) : null,
    assigneeId: assignee ? Number(assignee.id) : null,
    assigneeName: assignee ? String(assignee.name ?? "") : null,
    inboxId,
    inboxName: inboxId !== null ? inboxNames.get(inboxId) ?? `Buzón ${inboxId}` : null,
    lastMessage: lastMsg ? String(lastMsg.content ?? "") : null,
    lastMessageAt: lastMsg
      ? new Date((lastMsg.created_at as number) * 1000).toISOString()
      : null,
    createdAt: new Date(((raw.created_at as number) ?? 0) * 1000).toISOString(),
    unreadCount: (raw.unread_count as number) ?? 0,
    status: String(raw.status ?? "open"),
    handledBy: meta.assignee ? "human" : "ai",
    online: false,
    typing: false,
    messages: [],
    labels: Array.isArray(raw.labels) ? (raw.labels as unknown[]).map(String) : [],
  }
}

export type MappedConversation = ReturnType<typeof mapChatwootConversation>

// Chatwoot crea un registro de conversación nuevo por cada contacto cada
// vez que responde después de que la anterior se marcó "resolved" (p. ej.
// al cerrar una venta) — así es como se comporta su canal de WhatsApp
// Cloud API, no hay ajuste de inbox que lo evite. Para que no se vea como
// un chat "duplicado" en la lista, nos quedamos solo con la conversación
// más reciente por contacto (por teléfono); las anteriores siguen
// existiendo en Chatwoot con su historial intacto, solo no se listan aquí.
//
// La clave incluye el buzón: con más de un número de WhatsApp activo, un
// mismo cliente puede tener una conversación abierta en el buzón viejo y,
// por separado, escribirle al buzón nuevo (típico durante una migración,
// si todavía tiene guardado el número anterior) — son dos conversaciones
// reales y ninguna debe tapar a la otra en la lista.
function dedupeByPhone(conversations: MappedConversation[]): MappedConversation[] {
  const latestByKey = new Map<string, MappedConversation>()
  const withoutPhone: MappedConversation[] = []

  for (const c of conversations) {
    if (!c.phone) {
      withoutPhone.push(c)
      continue
    }
    const key = `${c.phone}:${c.inboxId ?? ""}`
    const existing = latestByKey.get(key)
    const activity = c.lastMessageAt ?? c.createdAt
    const existingActivity = existing ? (existing.lastMessageAt ?? existing.createdAt) : null
    if (!existing || activity > existingActivity!) {
      latestByKey.set(key, c)
    }
  }

  return [...latestByKey.values(), ...withoutPhone]
}

// Techo de seguridad para los loops de páginas de abajo — a 25 por página
// (el tamaño que usa Chatwoot) son ~1000 conversaciones. De sobra para el
// volumen actual; si algún día se llega a este techo, la solución ya no es
// subir el número sino pedirle a Chatwoot un filtro por fecha en vez de
// traer todo el historial completo en cada carga.
const CONVERSATIONS_PAGE_SAFETY_CAP = 40

interface ConversationsPageResult {
  batch: Record<string, unknown>[]
  allCount: number | null
}

async function fetchConversationsPage(page: number): Promise<ConversationsPageResult> {
  const data = await chatwootFetch<{
    data: { payload: Record<string, unknown>[]; meta?: { all_count?: number } }
  }>(`/conversations?status=all&page=${page}`, { cache: "no-store" })
  return {
    batch: data.data.payload,
    allCount: typeof data.data.meta?.all_count === "number" ? data.data.meta.all_count : null,
  }
}

// Sigue pidiendo páginas EN SERIE desde `fromPage` hasta que una vuelva
// vacía — el camino "correcto pero lento" de siempre, sin asumir ningún
// tamaño de página. Es el fallback de fetchAllConversationsRaw cuando no
// se puede (o no conviene) paralelizar.
async function fetchConversationsSequential(fromPage: number): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = []
  for (let page = fromPage; page <= CONVERSATIONS_PAGE_SAFETY_CAP; page++) {
    const { batch } = await fetchConversationsPage(page)
    if (batch.length === 0) break
    all.push(...batch)
  }
  return all
}

// Chatwoot pagina /conversations — pedir solo la página 1 significa que
// cualquier chat que no esté entre los más recientemente activos no vuelve
// nunca, ni siquiera buscándolo por nombre/teléfono (la búsqueda del front
// solo mira lo que ya está en memoria).
//
// [Paso D, post-incidente 2026-08-11 — ver la nota grande más abajo]
// Antes esto pedía cada página en SERIE (6 páginas × ~3s = ~18s por
// barrido). Ahora, si la página 1 trae `meta.all_count`, se calcula cuántas
// páginas hacen falta (con el tamaño de página OBSERVADO en esa misma
// respuesta, nunca asumido a mano) y se piden todas las demás con
// `Promise.all` — baja el barrido completo a ~3s (el tiempo de la página
// más lenta). Si `all_count` no viene, se cae al loop en serie de siempre:
// más lento pero siempre correcto, sin depender de un campo no documentado
// como estable.
//
// Red de seguridad: si la ÚLTIMA página pedida en paralelo vuelve
// completamente llena, probablemente `all_count` quedó desactualizado
// (alguien escribió mientras se armaban las páginas) y puede haber más
// detrás — en ese caso se sigue en serie desde ahí hasta que una vuelva
// vacía, igual que el camino sin `all_count`. Así nunca se vuelve a perder
// conversaciones viejas del listado (el bug que motivó paginar en primer
// lugar) a cambio de la velocidad.
async function fetchAllConversationsRaw(): Promise<Record<string, unknown>[]> {
  const first = await fetchConversationsPage(1)
  if (first.batch.length === 0) return []

  const pageSize = first.batch.length
  if (first.allCount === null || pageSize === 0) {
    return [...first.batch, ...(await fetchConversationsSequential(2))]
  }

  const totalPages = Math.min(
    Math.ceil(first.allCount / pageSize),
    CONVERSATIONS_PAGE_SAFETY_CAP,
  )
  if (totalPages <= 1) return first.batch

  const rest = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, i) => fetchConversationsPage(i + 2)),
  )
  const all = [...first.batch, ...rest.flatMap((r) => r.batch)]

  const lastPage = rest[rest.length - 1]
  if (lastPage.batch.length === pageSize) {
    all.push(...(await fetchConversationsSequential(totalPages + 1)))
  }

  return all
}

type ConversationsResult = { ok: true; conversations: MappedConversation[] } | { ok: false }

// ============================================================================
// NOTA DE INCIDENTE — leer esto primero si Chatwoot vuelve a saturarse o el
// listado de chats vuelve a tardar/quedar en blanco.
//
// Qué pasó (2026-08-11, producción): 137 conversaciones (6 páginas de 25).
// 340 peticiones a /conversations en 2 minutos, Chatwoot al 232% CPU,
// respuestas de hasta 13.5s, front en blanco. Causas combinadas:
//   1. use-chatwoot.ts recargaba el listado COMPLETO en cada "message_changed"
//      del SSE — evento que Chatwoot dispara por CADA mensaje de WhatsApp
//      entrante, no solo cuando cambia algo de la conversación en sí.
//   2. Este módulo no deduplicaba llamadas en vuelo — cada disparador (SSE +
//      polling de respaldo + varias pestañas) lanzaba su propio barrido
//      completo en paralelo con los demás, y todos pegaban a Chatwoot a la vez.
//
// Qué se arregló y en qué orden (los 4 pasos, letras usadas en la
// conversación de este cambio — quedan acá por si hace falta reconstruir el
// razonamiento):
//   A) Single-flight + micro-cache (este bloque, abajo) — colapsa barridos
//      concurrentes en uno solo. Mayor impacto, menor riesgo: se hizo primero.
//   B) use-chatwoot.ts: "message_changed" ya NO recarga el listado completo
//      (ver ese archivo) — solo refresca mensajes si es la conversación
//      activa, o actualiza esa fila en memoria sin red si es otra. La recarga
//      completa queda reservada para "conversation_changed" (mucho menos
//      frecuente: conversación creada/actualizada/cambio de estado).
//   C) use-chatwoot.ts: los "conversation_changed" que sí siguen disparando
//      recarga completa se agrupan en una ventana de ~800ms en vez de una
//      recarga por evento — importa sobre todo en ráfaga (Chatwoot procesando
//      varios cambios seguidos).
//   D) fetchAllConversationsRaw (arriba) pide las páginas 2..N EN PARALELO en
//      vez de en serie cuando Chatwoot manda `meta.all_count` — baja el
//      barrido completo de ~18s a ~3s. Con red de seguridad: si la última
//      página paralela vuelve llena, sigue en serie por si `all_count` estaba
//      desactualizado (para no reintroducir el bug de "no carga contactos
//      viejos" que motivó paginar en primer lugar).
//
// Si esto vuelve a pasar, revisar en este orden: ¿sigue habiendo
// single-flight activo (cacheState.inFlight se está usando)? ¿"message_changed"
// sigue sin recargar el listado completo? ¿el debounce de C sigue en pie en
// use-chatwoot.ts? ¿`meta.all_count` de Chatwoot se puso a devolver algo raro
// (null, 0, un número que no cuadra) y forzó el fallback lento de D?
//
// Single-flight + micro-cache — el barrido completo de páginas de arriba es
// caro (secuencial: ~3s por página cuando no se pudo paralelizar por D) y
// este módulo se llama en CADA request a /api/chatwoot/conversations.
//
// Es estado de proceso (Node module scope, anclado a globalThis para
// sobrevivir el fast refresh de Turbopack en dev, mismo patrón que
// lib/chatwoot/event-bus.ts) — funciona porque hoy corre una sola réplica.
// Si el despliegue pasa a tener más de una, esto deja de colapsar peticiones
// entre réplicas distintas (cada una tendría su propio caché) y haría falta
// algo compartido (Redis) en su lugar.
// ============================================================================
const CACHE_TTL_MS = 2_500

interface ConversationsCacheState {
  inFlight: Promise<ConversationsResult> | null
  fresh: { conversations: MappedConversation[]; expiresAt: number } | null
}

const globalForConversationsCache = globalThis as unknown as {
  __chatwootConversationsCache?: ConversationsCacheState
}
const cacheState: ConversationsCacheState =
  globalForConversationsCache.__chatwootConversationsCache ?? { inFlight: null, fresh: null }
globalForConversationsCache.__chatwootConversationsCache = cacheState

async function sweepConversations(): Promise<ConversationsResult> {
  try {
    // status=all — por defecto Chatwoot solo devuelve conversaciones
    // "open"; sin esto, una conversación resuelta (p. ej. tras cerrar una
    // venta) desaparecería por completo en vez de pasar a "Cerrados".
    const [payload, inboxes] = await Promise.all([
      fetchAllConversationsRaw(),
      listInboxes().catch(() => []),
    ])
    const inboxNames = new Map(inboxes.map((ib) => [ib.id, ib.name]))
    const conversations = dedupeByPhone(
      payload.map((raw) => mapChatwootConversation(raw, inboxNames)),
    )

    for (const c of conversations) {
      if (!c.phone) continue
      upsertContactFromChatwoot({
        phone: c.phone,
        name: c.contactName,
        lastMessage: c.lastMessage,
        lastMessageAt: c.lastMessageAt,
        unreadCount: c.unreadCount,
      })
    }

    // Solo se cachea el ÉXITO — si Chatwoot respondió mal, la próxima
    // llamada debe poder reintentar de una vez en vez de quedarse pegada a
    // un error por 2.5s.
    cacheState.fresh = { conversations, expiresAt: Date.now() + CACHE_TTL_MS }
    return { ok: true, conversations }
  } catch {
    return { ok: false }
  }
}

// Pide las conversaciones a Chatwoot y sincroniza sus contactos en el CRM
// (por teléfono). Devuelve `ok: false` si la API no responde — así el
// front puede distinguir "no configurado" de "configurado pero caído".
export async function fetchAndSyncConversations(): Promise<ConversationsResult> {
  const now = Date.now()
  if (cacheState.fresh && cacheState.fresh.expiresAt > now) {
    return { ok: true, conversations: cacheState.fresh.conversations }
  }

  // Ya hay un barrido en curso: todo el que llegue mientras tanto espera
  // ESE resultado en vez de lanzar el suyo propio. No hay punto de `await`
  // entre este check y la asignación de abajo, así que dos llamadas
  // "simultáneas" nunca alcanzan a pisarse — JS resuelve una antes de que
  // la otra corra.
  if (cacheState.inFlight) return cacheState.inFlight

  const sweep = sweepConversations().finally(() => {
    cacheState.inFlight = null
  })
  cacheState.inFlight = sweep
  return sweep
}
