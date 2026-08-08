// ============================================================================
// Puente compartido entre /api/chatwoot/conversations y /api/contacts.
// Ambas rutas necesitan la misma respuesta de Chatwoot: la primera para
// listar conversaciones, la segunda para saber si la API responde de
// verdad ahora mismo (no solo si CHATWOOT_URL/TOKEN/ACCOUNT_ID están
// configuradas) y para sincronizar los contactos del CRM.
// ============================================================================

import { chatwootFetch } from "@/lib/chatwoot/client"
import { upsertContactFromChatwoot } from "@/lib/api/contacts-demo-store"

export function mapChatwootConversation(raw: Record<string, unknown>) {
  const meta = (raw.meta as Record<string, unknown>) ?? {}
  const sender = (meta.sender as Record<string, unknown>) ?? {}
  const assignee = meta.assignee as Record<string, unknown> | null | undefined
  const lastMsg = (
    Array.isArray(raw.messages) && raw.messages.length > 0
      ? (raw.messages[raw.messages.length - 1] as Record<string, unknown>)
      : null
  ) as Record<string, unknown> | null

  return {
    id: String(raw.id ?? ""),
    contactName: String(sender.name ?? "Desconocido"),
    phone: String(sender.phone_number ?? ""),
    avatarUrl: sender.thumbnail ? String(sender.thumbnail) : null,
    assigneeId: assignee ? Number(assignee.id) : null,
    assigneeName: assignee ? String(assignee.name ?? "") : null,
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
function dedupeByPhone(conversations: MappedConversation[]): MappedConversation[] {
  const latestByPhone = new Map<string, MappedConversation>()
  const withoutPhone: MappedConversation[] = []

  for (const c of conversations) {
    if (!c.phone) {
      withoutPhone.push(c)
      continue
    }
    const existing = latestByPhone.get(c.phone)
    const activity = c.lastMessageAt ?? c.createdAt
    const existingActivity = existing ? (existing.lastMessageAt ?? existing.createdAt) : null
    if (!existing || activity > existingActivity!) {
      latestByPhone.set(c.phone, c)
    }
  }

  return [...latestByPhone.values(), ...withoutPhone]
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
    const data = await chatwootFetch<{ data: { payload: Record<string, unknown>[] } }>(
      "/conversations?status=all",
      { cache: "no-store" },
    )
    const conversations = dedupeByPhone(data.data.payload.map(mapChatwootConversation))

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
