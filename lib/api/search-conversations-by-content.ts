// ============================================================================
// Búsqueda por contenido de mensajes (no solo nombre/teléfono) para el
// buscador de la bandeja de WhatsApp — ver components/chat/conversation-list.tsx.
// El listado que llega al front solo trae el ÚLTIMO mensaje de cada
// conversación (lastMessage), así que una frase mencionada en un mensaje
// viejo no es encontrable filtrando en memoria: hace falta consultar la
// tabla `messages` de Chatwoot (ver searchMessagesByContent,
// lib/api/chatwoot-db.ts).
//
// Devuelve también un `snippet` (vía buildSnippet) por cada match, para que
// el front pueda mostrar DÓNDE aparece la frase en vez del último mensaje
// del hilo — ver el pedido del 2026-08-18 en conversation-list.tsx.
//
// Deps inyectadas (mismo patrón que ReleaseDeps en release-inactive-agent.ts)
// para poder probar el gate de longitud mínima sin tocar Postgres.
// ============================================================================

import { buildSnippet } from "@/lib/message-snippet"

export const MIN_SEARCH_PHRASE_LENGTH = 3

export interface ContentMatch {
  conversationId: string
  content: string
}

export interface SearchContentDeps {
  searchMessagesByContent: (accountId: string, phrase: string) => Promise<ContentMatch[] | null>
}

export interface ContentSearchResult {
  conversationId: string
  snippet: string
}

// Menos de 3 caracteres no consulta la DB — evita golpear la tabla de
// mensajes en cada tecla que escribe el asesor mientras todavía está
// tipeando una palabra corta.
export async function searchConversationsByContent(
  accountId: string,
  rawPhrase: string,
  deps: SearchContentDeps,
): Promise<ContentSearchResult[]> {
  const phrase = rawPhrase.trim()
  if (phrase.length < MIN_SEARCH_PHRASE_LENGTH) return []

  const matches = await deps.searchMessagesByContent(accountId, phrase)
  if (!matches) return []

  return matches.map((m) => ({
    conversationId: m.conversationId,
    snippet: buildSnippet(m.content, phrase),
  }))
}
