// ============================================================================
// Formato de métricas de asesor (Centro de Control admin y Centro de
// Operaciones del propio asesor) — extraído de
// components/views/advisor-control-view.tsx para reusarlo en ambos sin
// duplicar la lógica.
// ============================================================================

// Mismo shape que devuelven GET /api/dashboard/agents y GET
// /api/agent-stats/me — se define acá (client-safe) en vez de importar
// AgentDailyStats de lib/chatwoot-agent-stats.ts, que tira de
// lib/chatwoot/client.ts (server-only) y no debe entrar al bundle de cliente.
export interface AgentStatsDto {
  available: boolean
  chatsRespondidos: number
  chatsRespondidosAyer: number
  velocidadRespuestaSegundos: number | null
  velocidadRespuestaSegundosAyer: number | null
  tasaRespuesta: number | null
  tasaRespuestaAyer: number | null
  tiempoMuertoSegundos: number
  tiempoMuertoSegundosAyer: number
}

// "0" está bien como número real (nadie respondió mensajes ayer): la
// diferencia real con "sin dato" es null/undefined, no 0 — por eso no se
// puede reusar directo el percentTrend de dashboard/kpis (ese asume que
// "hoy" y "ayer" siempre existen).
export function trendPercent(today: number, yesterday: number): number | null {
  if (yesterday === 0) return today > 0 ? 100 : null
  return Math.round(((today - yesterday) / yesterday) * 1000) / 10
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—"
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`
}
