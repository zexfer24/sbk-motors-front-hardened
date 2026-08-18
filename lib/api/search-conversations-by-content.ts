// ============================================================================
// Búsqueda por contenido de mensajes (no solo nombre/teléfono) para el
// buscador de la bandeja de WhatsApp — ver components/chat/conversation-list.tsx.
// El listado que llega al front solo trae el ÚLTIMO mensaje de cada
// conversación (lastMessage), así que una frase mencionada en un mensaje
// viejo no es encontrable filtrando en memoria: hace falta consultar la
// tabla `messages` de Chatwoot (ver searchConversationIdsByContent,
// lib/api/chatwoot-db.ts).
//
// Deps inyectadas (mismo patrón que ReleaseDeps en release-inactive-agent.ts)
// para poder probar el gate de longitud mínima sin tocar Postgres.
// ============================================================================

export const MIN_SEARCH_PHRASE_LENGTH = 3

export interface SearchContentDeps {
  searchConversationIdsByContent: (accountId: string, phrase: string) => Promise<string[] | null>
}

// Menos de 3 caracteres no consulta la DB — evita golpear la tabla de
// mensajes en cada tecla que escribe el asesor mientras todavía está
// tipeando una palabra corta.
export async function searchConversationsByContent(
  accountId: string,
  rawPhrase: string,
  deps: SearchContentDeps,
): Promise<string[]> {
  const phrase = rawPhrase.trim()
  if (phrase.length < MIN_SEARCH_PHRASE_LENGTH) return []

  const ids = await deps.searchConversationIdsByContent(accountId, phrase)
  return ids ?? []
}
