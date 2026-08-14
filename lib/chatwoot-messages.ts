// ============================================================================
// Helpers puros sobre listas de ChatwootMessage ya combinadas con notas de
// sistema (ver lib/api/chat-system-events.ts) — separados de
// app/api/chatwoot/conversations/[id]/messages/route.ts (que usa
// mergeSystemEvents) y de lib/hooks/use-chatwoot.ts (que usa
// oldestRealMessageId) para poder probarlos sin depender de Next ni de React.
// ============================================================================

import type { ChatwootMessage } from "@/lib/types/chatwoot"

const REAL_MESSAGE_ID = /^[0-9]{1,18}$/

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
