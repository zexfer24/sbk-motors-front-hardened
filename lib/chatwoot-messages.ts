// ============================================================================
// Helpers puros sobre listas de ChatwootMessage ya combinadas con notas de
// sistema (ver lib/api/chat-system-events.ts) — separados de
// app/api/chatwoot/conversations/[id]/messages/route.ts (que usa
// mergeSystemEvents) y de lib/hooks/use-chatwoot.ts (que usa
// oldestRealMessageId) para poder probarlos sin depender de Next ni de React.
// ============================================================================

import type { ChatwootMessage } from "@/lib/types/chatwoot"

const REAL_MESSAGE_ID = /^[0-9]{1,18}$/

export type MessageDeliveryStatus = "sent" | "delivered" | "read"

const KNOWN_MESSAGE_STATUSES = new Set<string>(["sent", "delivered", "read"])

// Compartido entre las 3 capas que necesitan traducir el `status` crudo de
// Chatwoot ("sent"/"delivered"/"read"/"failed"/lo que sea) al subconjunto que
// el front sabe dibujar como check/doble check: los mensajes individuales
// (app/api/chatwoot/conversations/[id]/messages/route.ts), el listado vía API
// (lib/api/chatwoot-sync.ts) y el listado vía Postgres directo
// (lib/api/chatwoot-db.ts). Antes esto vivía duplicado a mano en el primero;
// "failed" y cualquier valor no reconocido caen a "sent" — mismo criterio de
// siempre, ni el mensaje individual ni la miniatura distinguen fallos todavía.
export function normalizeMessageStatus(raw: unknown): MessageDeliveryStatus {
  const value = String(raw ?? "")
  return KNOWN_MESSAGE_STATUSES.has(value) ? (value as MessageDeliveryStatus) : "sent"
}

// Cursor real más viejo para paginar "hacia atrás" (GET .../messages?before=).
// Las notas de sistema ("tomó/soltó", ver mergeSystemEvents más abajo) traen
// ids sintéticos ("system-<iso>-<n>") que Chatwoot no entiende como cursor.
// Antes de este fix, loadOlderMessages usaba ciegamente messages[0].id: si
// una nota terminaba de primera en el arreglo (varias notas seguidas justo
// antes del primer mensaje real cargado, como en el chat de Leonardo Mora,
// conversation_id 74), ese id no matcheaba /^[0-9]{1,18}$/, `before` quedaba
// null server-side y Chatwoot devolvía la MISMA tanda reciente de siempre —
// un bucle sin fin que nunca llegaba a los mensajes viejos de verdad. Se
// asume orden cronológico ascendente (es como llega el arreglo tras el sort
// de mergeSystemEvents), y devuelve el primer id que sí es un mensaje real.
export function oldestRealMessageId(messages: ChatwootMessage[]): string | null {
  for (const m of messages) {
    if (REAL_MESSAGE_ID.test(m.id)) return m.id
  }
  return null
}

// BUG (reportado por el cliente como "pierde historial", confirmado
// 2026-08-18): loadMessages() en use-chatwoot.ts se reusaba tanto para la
// carga inicial de una conversación como para el refresco que dispara el SSE
// en cada "message_changed" de la conversación activa — y en ambos casos
// hacía `setMessages(data.messages)`, un reemplazo total. `data.messages` es
// siempre la ÚLTIMA tanda que devuelve Chatwoot (sin cursor `before`), así
// que cualquier historial más viejo que el asesor hubiera cargado con
// "Cargar mensajes anteriores" (loadOlderMessages, que sí antepone en vez de
// reemplazar) desaparecía de la pantalla en cuanto llegaba UN mensaje nuevo
// del cliente — algo casi garantizado en un chat activo. No hacía falta red
// lenta ni Postgres: pasaba siempre, con Chatwoot respondiendo perfecto.
//
// Fix: en vez de reemplazar, conserva de `prev` todo lo que sea estrictamente
// más viejo que el mensaje más viejo de la tanda fresca (y no esté ya en
// ella) y lo antepone — mismo criterio que loadOlderMessages ya usa para
// prepender, solo que acá el interior son de una tanda "presente" en vez de
// "más vieja". Se asume orden cronológico ascendente en ambos arreglos, como
// el resto de este archivo.
export function mergeRefreshedMessages(
  prev: ChatwootMessage[],
  fresh: ChatwootMessage[],
): ChatwootMessage[] {
  if (prev.length === 0 || fresh.length === 0) return fresh

  const freshIds = new Set(fresh.map((m) => m.id))
  const oldestFreshMs = Math.min(...fresh.map((m) => new Date(m.createdAt).getTime()))
  const olderThanFresh = prev.filter(
    (m) => !freshIds.has(m.id) && new Date(m.createdAt).getTime() < oldestFreshMs,
  )
  return [...olderThanFresh, ...fresh]
}

// Intercala las notas de "tomó/soltó la conversación" entre los mensajes
// reales, ordenadas por fecha — para que aparezcan en el punto del historial
// en que realmente pasaron, no todas al final.
//
// Acotado a la ventana ya cargada: una nota más vieja que el primer mensaje
// real de esta tanda pertenece a una parte del historial que todavía no se
// trajo "hacia atrás" — mezclarla igual, además de romper la paginación (ver
// oldestRealMessageId de arriba), la deja fuera de su lugar cronológico real
// (aparecería pegada a mensajes de días después). Se muestra recién cuando
// esa parte del historial se cargue de verdad.
export function mergeSystemEvents(
  messages: ChatwootMessage[],
  events: { content: string; createdAt: string }[],
): ChatwootMessage[] {
  if (events.length === 0 || messages.length === 0) return messages

  const oldestRealMs = Math.min(...messages.map((m) => new Date(m.createdAt).getTime()))
  const systemMessages: ChatwootMessage[] = events
    .map((e, i) => ({
      id: `system-${e.createdAt}-${i}`,
      content: e.content,
      messageType: "system" as const,
      senderType: "human" as const,
      senderName: null,
      createdAt: e.createdAt,
      attachments: [],
    }))
    .filter((e) => new Date(e.createdAt).getTime() >= oldestRealMs)

  if (systemMessages.length === 0) return messages

  return [...messages, ...systemMessages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )
}
