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

// Techo de seguridad para el loop de páginas de abajo — a 25 por página
// (el tamaño que usa Chatwoot) son ~1000 conversaciones. De sobra para el
// volumen actual; si algún día se llega a este techo, la solución ya no es
// subir el número sino pedirle a Chatwoot un filtro por fecha en vez de
// traer todo el historial completo en cada carga.
const CONVERSATIONS_PAGE_SAFETY_CAP = 40

// Chatwoot pagina /conversations (¿25 por página?, no documentado como
// estable) — pedir solo la página 1 significa que cualquier chat que no
// esté entre los más recientemente activos no vuelve nunca, ni siquiera
// buscándolo por nombre/teléfono (la búsqueda del front solo mira lo que ya
// está en memoria). Se pagina hasta que una página vuelve vacía, en vez de
// asumir un tamaño de página fijo, para no depender de un detalle interno
// de Chatwoot que se nos puede escapar. `all_count` (si Chatwoot lo manda)
// solo se usa como atajo para cortar antes si ya se juntó todo — nunca para
// calcular cuántas páginas pedir.
async function fetchAllConversationsRaw(): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = []
  let expectedTotal: number | null = null

  for (let page = 1; page <= CONVERSATIONS_PAGE_SAFETY_CAP; page++) {
    const data = await chatwootFetch<{
      data: { payload: Record<string, unknown>[]; meta?: { all_count?: number } }
    }>(`/conversations?status=all&page=${page}`, { cache: "no-store" })

    const batch = data.data.payload
    if (batch.length === 0) break
    all.push(...batch)

    if (expectedTotal === null && typeof data.data.meta?.all_count === "number") {
      expectedTotal = data.data.meta.all_count
    }
    if (expectedTotal !== null && all.length >= expectedTotal) break
  }

  return all
}

// Pide las conversaciones a Chatwoot y sincroniza sus contactos en el CRM
// (por teléfono). Devuelve `ok: false` si la API no responde — así el
// front puede distinguir "no configurado" de "configurado pero caído".
export async function fetchAndSyncConversations(): Promise<
  { ok: true; conversations: MappedConversation[] } | { ok: false }
> {
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

    return { ok: true, conversations }
  } catch {
    return { ok: false }
  }
}
