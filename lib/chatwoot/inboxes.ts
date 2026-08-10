// ============================================================================
// Lista de buzones de la cuenta de Chatwoot — punto único para que tanto el
// listado de conversaciones (asignarle un nombre de buzón a cada una) como
// el flujo de "Nuevo chat" (elegir desde qué número escribir) usen la misma
// fuente de verdad en vez de cada uno resolviendo el inbox por su cuenta,
// que es como terminamos con la función vieja fijada a un solo buzón.
// ============================================================================

import { chatwootFetch } from "@/lib/chatwoot/client"

export interface ChatwootInbox {
  id: number
  name: string
  channelType: string
}

let cache: { data: ChatwootInbox[]; expiresAt: number } | null = null
const CACHE_TTL_MS = 5 * 60_000

export async function listInboxes(): Promise<ChatwootInbox[]> {
  if (cache && Date.now() < cache.expiresAt) return cache.data

  const data = await chatwootFetch<{ payload: Array<Record<string, unknown>> }>("/inboxes")
  const inboxes = data.payload.map((ib) => ({
    id: Number(ib.id),
    name: String(ib.name ?? `Buzón ${ib.id}`),
    channelType: String(ib.channel_type ?? ""),
  }))
  cache = { data: inboxes, expiresAt: Date.now() + CACHE_TTL_MS }
  return inboxes
}

export async function listWhatsappInboxes(): Promise<ChatwootInbox[]> {
  const inboxes = await listInboxes()
  return inboxes.filter((ib) => ib.channelType === "Channel::Whatsapp")
}
