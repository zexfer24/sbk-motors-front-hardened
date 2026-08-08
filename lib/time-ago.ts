export function timeAgo(iso: string | null): string {
  if (!iso) return "sin interacciones"
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.max(0, Math.round(diffMs / 60_000))

  if (minutes < 1) return "ahora"
  if (minutes < 60) return `hace ${minutes} min`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `hace ${hours} h`

  const days = Math.round(hours / 24)
  if (days === 1) return "ayer"
  return `hace ${days} días`
}
