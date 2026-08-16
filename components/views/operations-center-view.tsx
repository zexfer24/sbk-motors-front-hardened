'use client'

import { useEffect, useState } from 'react'
import { Clock, Gauge, MessagesSquare, MessageSquareText, Target } from 'lucide-react'
import type { ChatwootConversation } from '@/lib/types/chatwoot'
import { avatarColor } from '@/lib/avatar-color'
import { formatRelativeTime } from '@/lib/relative-time'
import { formatDuration, trendPercent, type AgentStatsDto } from '@/lib/agent-stats-format'
import { MetricTile } from '@/components/dashboard/agent-metric-tile'
import { useAuth } from '@/lib/hooks/use-auth'
import { cn } from '@/lib/utils'

interface MyStatsResponse {
  chatwootAgentId: number | null
  stats: AgentStatsDto | null
  activo: boolean | null
}

async function fetchMyStats(): Promise<MyStatsResponse> {
  const res = await fetch('/api/agent-stats/me', { cache: 'no-store' })
  if (!res.ok) throw new Error('No se pudieron cargar tus métricas.')
  return res.json()
}

interface OperationsCenterViewProps {
  /** Todas las conversaciones ya cargadas por ChatView (useChatwoot) — se filtra acá a las propias, sin pedir nada nuevo al backend. */
  conversations: ChatwootConversation[]
  onSelectConversation: (id: string) => void
}

// Vista por defecto del Chat cuando no hay ninguna conversación seleccionada
// (pedido explícito del negocio, 2026-08-16) — antes era un placeholder
// vacío ("Selecciona una conversación"). Reusa el mismo patrón de datos que
// el Centro de Control admin (components/views/advisor-control-view.tsx):
// métricas del día vía /api/agent-stats/me (la versión "propia" y no
// admin-only de /api/dashboard/agents) + las conversaciones ya cargadas,
// filtradas a las asignadas a este asesor.
export function OperationsCenterView({ conversations, onSelectConversation }: OperationsCenterViewProps) {
  const { user } = useAuth()
  const [myStats, setMyStats] = useState<MyStatsResponse | null>(null)
  const [statsError, setStatsError] = useState<string | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setStatsLoading(true)
    fetchMyStats()
      .then((data) => {
        if (!cancelled) {
          setMyStats(data)
          setStatsError(null)
        }
      })
      .catch(() => {
        if (!cancelled) setStatsError('No se pudieron cargar tus métricas del día.')
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const myAgentId = user?.chatwootAgentId ?? null
  const myConversations = myAgentId === null
    ? []
    : conversations
        .filter((c) => c.assigneeId === myAgentId && c.status === 'open')
        .sort((a, b) => {
          const aTime = a.lastMessageAt ?? a.createdAt
          const bTime = b.lastMessageAt ?? b.createdAt
          return new Date(bTime).getTime() - new Date(aTime).getTime()
        })
  const unreadCount = myConversations.filter((c) => c.unreadCount > 0).length

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="border-b border-border px-6 py-5">
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-primary">Tu día</p>
        <h1 className="heading-stamp mt-1 text-xl text-foreground">Centro de Operaciones</h1>
      </div>

      <div className="flex flex-1 flex-col gap-5 p-6">
        {myAgentId === null ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Tu usuario todavía no está vinculado a un agente de Chatwoot — no hay métricas ni chats propios que mostrar acá.
          </p>
        ) : (
          <>
            {statsError && (
              <p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
                {statsError}
              </p>
            )}

            {statsLoading ? (
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border/60 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-16 animate-pulse bg-card" />
                ))}
              </div>
            ) : !myStats?.stats || !myStats.stats.available ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                Métricas no disponibles por ahora.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border/60 lg:grid-cols-4">
                <MetricTile
                  icon={MessagesSquare}
                  label="Respondidos hoy"
                  value={String(myStats.stats.chatsRespondidos)}
                  trend={trendPercent(myStats.stats.chatsRespondidos, myStats.stats.chatsRespondidosAyer)}
                />
                <MetricTile
                  icon={Gauge}
                  label="Velocidad"
                  value={formatDuration(myStats.stats.velocidadRespuestaSegundos)}
                  trend={
                    myStats.stats.velocidadRespuestaSegundos !== null &&
                    myStats.stats.velocidadRespuestaSegundosAyer !== null
                      ? trendPercent(
                          myStats.stats.velocidadRespuestaSegundos,
                          myStats.stats.velocidadRespuestaSegundosAyer,
                        )
                      : null
                  }
                  invert
                />
                <MetricTile
                  icon={Target}
                  label="Tasa de respuesta"
                  value={myStats.stats.tasaRespuesta !== null ? `${myStats.stats.tasaRespuesta}%` : '—'}
                  trend={
                    myStats.stats.tasaRespuesta !== null && myStats.stats.tasaRespuestaAyer !== null
                      ? trendPercent(myStats.stats.tasaRespuesta, myStats.stats.tasaRespuestaAyer)
                      : null
                  }
                />
                <MetricTile
                  icon={Clock}
                  label="Tiempo muerto"
                  value={formatDuration(myStats.stats.tiempoMuertoSegundos)}
                  trend={trendPercent(myStats.stats.tiempoMuertoSegundos, myStats.stats.tiempoMuertoSegundosAyer)}
                  invert
                />
              </div>
            )}

            <div className="flex min-h-0 flex-1 flex-col">
              <h2 className="heading-stamp mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                <MessageSquareText className="h-3.5 w-3.5" />
                Mis conversaciones asignadas
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {myConversations.length}
                </span>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-unread px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                    {unreadCount} sin contestar
                  </span>
                )}
              </h2>

              {myConversations.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  No tenés conversaciones abiertas asignadas ahora mismo.
                </p>
              ) : (
                <div className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {myConversations.map((c) => {
                    const color = avatarColor(c.phone || c.contactName)
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => onSelectConversation(c.id)}
                        className="flex items-center gap-3 bg-card px-4 py-3 text-left transition-colors hover:bg-secondary"
                      >
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                          style={{ backgroundColor: color.bg, color: color.fg }}
                        >
                          {c.contactName.charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{c.contactName}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {c.lastMessage || c.phone}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="text-[0.65rem] text-muted-foreground">
                            {formatRelativeTime(c.lastMessageAt)}
                          </span>
                          {c.unreadCount > 0 && (
                            <span
                              className={cn(
                                'flex h-5 min-w-5 items-center justify-center rounded-full bg-unread px-1.5 font-mono text-[0.65rem] font-bold text-primary-foreground',
                              )}
                            >
                              {c.unreadCount}
                            </span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
