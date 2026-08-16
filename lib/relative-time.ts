// Extraído de components/chat/conversation-list.tsx (la fila de cada chat ya
// mostraba esto) para reusarlo también en
// components/views/operations-center-view.tsx sin duplicar la lógica.
export function formatRelativeTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return ""
  const date = new Date(iso)
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return "ahora"
  if (diffMin < 60) return `${diffMin}min`

  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return "ayer"
  return date.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" })
}
