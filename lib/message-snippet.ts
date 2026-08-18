// Recorta el contenido de un mensaje alrededor de una frase buscada, para
// mostrar en la lista de conversaciones DÓNDE aparece la frase, en vez del
// mensaje completo (o del último mensaje, que puede no ser el que matchea —
// ver components/chat/conversation-list.tsx y
// lib/api/search-conversations-by-content.ts).
const DEFAULT_CONTEXT_CHARS = 40

export function buildSnippet(content: string, phrase: string, contextChars = DEFAULT_CONTEXT_CHARS): string {
  const normalizedContent = content.toLowerCase()
  const normalizedPhrase = phrase.trim().toLowerCase()
  const index = normalizedContent.indexOf(normalizedPhrase)
  // No se encontró con este match case-insensitive simple (p. ej. el
  // contenido tenía ¡!/mayúsculas que sí igualaba la query SQL, ver
  // CONTENT_SEARCH_QUERY en chatwoot-db.ts, pero no este indexOf más
  // simple) — se devuelve el contenido completo en vez de un recorte a
  // ciegas.
  if (index === -1) return content

  const start = Math.max(0, index - contextChars)
  const end = Math.min(content.length, index + normalizedPhrase.length + contextChars)
  const prefix = start > 0 ? "…" : ""
  const suffix = end < content.length ? "…" : ""
  return `${prefix}${content.slice(start, end).trim()}${suffix}`
}
