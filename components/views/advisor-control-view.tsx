'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Bot,
  Check,
  ChevronDown,
  Clock,
  Gauge,
  Inbox,
  Loader2,
  MessagesSquare,
  Target,
  TrendingDown,
  TrendingUp,
  User,
} from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { useChatwoot } from '@/lib/hooks/use-chatwoot'
import { assignConversation, fetchAgents, type Agent } from '@/lib/api/chatwoot'
import type { ChatwootConversation } from '@/lib/types/chatwoot'
import { avatarColor } from '@/lib/avatar-color'
import { cn } from '@/lib/utils'

// Mismo shape que devuelve GET /api/dashboard/agents — se define acá en vez
// de importar lib/chatwoot-agent-stats.ts (ese módulo tira de lib/chatwoot/
// client.ts, server-only, no debe entrar al bundle de cliente).
interface AgentStatsDto {
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

interface AgentWithStats {
  email: string
  chatwootAgentId: number
  stats: AgentStatsDto | null
  /** null = la tabla `asesores` no tiene fila para este asesor todavía (ver db/asesores_schema_reference.md). */
  activo: boolean | null
}

async function fetchAgentStats(): Promise<AgentWithStats[]> {
  const res = await fetch('/api/dashboard/agents', { cache: 'no-store' })
  if (!res.ok) throw new Error('No se pudieron cargar las métricas de asesores.')
  const data = await res.json()
  return data.agents as AgentWithStats[]
}

async function setAgentActive(chatwootAgentId: number, activo: boolean): Promise<void> {
  const res = await fetch('/api/dashboard/agents/active', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatwootAgentId, activo }),
  })
  if (!res.ok) throw new Error('No se pudo cambiar el estado del asesor.')
}

// Admin-only (ver app/page.tsx y proxy.ts, /api/dashboard/* completo lo es).
// Panel con los 4 asesores y sus métricas del día arriba; debajo, el
// inventario completo de chats sin asignar con la opción de repartirlos.
// Ver components/chat/conversation-list.tsx (matchesStatus) para la
// contraparte: desde acá se ve y reparte todo; los asesores solo ven lo
// suyo + "Libres".
export function AdvisorControlView({ active = true }: { active?: boolean }) {
  const { conversations, loading: conversationsLoading, reload } = useChatwoot(active)
  const [agents, setAgents] = useState<Agent[] | null>(null)
  const [agentsError, setAgentsError] = useState<string | null>(null)
  const [agentStats, setAgentStats] = useState<AgentWithStats[] | null>(null)
  const [agentStatsLoading, setAgentStatsLoading] = useState(true)
  const [agentStatsError, setAgentStatsError] = useState<string | null>(null)
  const [reassigningId, setReassigningId] = useState<string | null>(null)
  const [reassignError, setReassignError] = useState<string | null>(null)
  const [onlyUnanswered, setOnlyUnanswered] = useState(false)

  useEffect(() => {
    if (!active) return
    let cancelled = false
    fetchAgents()
      .then((list) => {
        if (!cancelled) setAgents(list)
      })
      .catch(() => {
        if (!cancelled) setAgentsError('No se pudo cargar la lista de asesores.')
      })
    return () => {
      cancelled = true
    }
  }, [active])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    setAgentStatsLoading(true)
    fetchAgentStats()
      .then((list) => {
        if (!cancelled) {
          setAgentStats(list)
          setAgentStatsError(null)
        }
      })
      .catch(() => {
        if (!cancelled) setAgentStatsError('No se pudieron cargar las métricas del día.')
      })
      .finally(() => {
        if (!cancelled) setAgentStatsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [active])

  // Optimista porque es un toggle simple de un booleano — se revierte si la
  // escritura falla. Afecta la auto-asignación real de n8n, así que además
  // de la UI hay que confiar en que /api/dashboard/agents/active de verdad
  // aplicó el cambio antes de darlo por hecho.
  async function handleToggleActive(chatwootAgentId: number, next: boolean) {
    setAgentStats((prev) =>
      (prev ?? []).map((a) => (a.chatwootAgentId === chatwootAgentId ? { ...a, activo: next } : a)),
    )
    try {
      await setAgentActive(chatwootAgentId, next)
    } catch {
      setAgentStats((prev) =>
        (prev ?? []).map((a) => (a.chatwootAgentId === chatwootAgentId ? { ...a, activo: !next } : a)),
      )
      setAgentStatsError('No se pudo cambiar el estado del asesor. Intenta de nuevo.')
    }
  }

  async function handleReassign(conversationId: string, agentId: number | null) {
    setReassignError(null)
    setReassigningId(conversationId)
    try {
      await assignConversation(conversationId, agentId)
      await reload({ silent: true })
    } catch {
      setReassignError('No se pudo reasignar el chat. Intenta de nuevo.')
    } finally {
      setReassigningId(null)
    }
  }

  const open = conversations.filter((c) => c.status === 'open')
  // A propósito NO exige unreadCount > 0 (a diferencia del filtro "Libres"
  // de components/chat/conversation-list.tsx) — acá es un inventario
  // completo de lo sin asignar para que el admin reparta, no solo la cola
  // urgente de autoservicio de los asesores.
  const unassigned = open.filter((c) => c.assigneeId == null)
  const unassignedFiltered = onlyUnanswered ? unassigned.filter((c) => c.unreadCount > 0) : unassigned
  const linkedAgents = useMemo(() => (agents ?? []).filter((a) => a.chatwootAgentId !== null), [agents])

  const byAgent = useMemo(() => {
    const map = new Map<number, ChatwootConversation[]>()
    for (const c of open) {
      if (c.assigneeId == null) continue
      const list = map.get(c.assigneeId) ?? []
      list.push(c)
      map.set(c.assigneeId, list)
    }
    return map
  }, [open])

  const statsByAgentId = useMemo(() => {
    const map = new Map<number, AgentStatsDto | null>()
    for (const a of agentStats ?? []) map.set(a.chatwootAgentId, a.stats)
    return map
  }, [agentStats])

  const activeByAgentId = useMemo(() => {
    const map = new Map<number, boolean | null>()
    for (const a of agentStats ?? []) map.set(a.chatwootAgentId, a.activo)
    return map
  }, [agentStats])

  const totalUnread = open.filter((c) => c.unreadCount > 0).length
  const loading = conversationsLoading && conversations.length === 0

  return (
    <>
      <PageHeader eyebrow="Supervisión" title="Centro de control de asesores" />

      <div className="flex flex-1 flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        {agentsError && <ErrorBanner message={agentsError} />}
        {agentStatsError && <ErrorBanner message={agentStatsError} />}
        {reassignError && <ErrorBanner message={reassignError} />}

        {loading ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <StatsRow
              openCount={open.length}
              unassignedCount={unassigned.length}
              unreadCount={totalUnread}
              agentCount={linkedAgents.length}
            />

            <div>
              <h2 className="heading-stamp mb-3 text-sm text-muted-foreground">Asesores</h2>
              {linkedAgents.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  Ningún asesor vinculado a Chatwoot todavía.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {linkedAgents.map((a) => (
                    <AdvisorCard
                      key={a.email}
                      agent={a}
                      assignedCount={(byAgent.get(a.chatwootAgentId!) ?? []).length}
                      unreadCount={(byAgent.get(a.chatwootAgentId!) ?? []).filter((c) => c.unreadCount > 0).length}
                      stats={statsByAgentId.get(a.chatwootAgentId!) ?? null}
                      loading={agentStatsLoading}
                      activo={activeByAgentId.get(a.chatwootAgentId!) ?? null}
                      onToggleActive={(next) => handleToggleActive(a.chatwootAgentId!, next)}
                    />
                  ))}
                </div>
              )}
            </div>

            <UnassignedSection
              conversations={unassignedFiltered}
              totalCount={unassigned.length}
              agents={linkedAgents}
              reassigningId={reassigningId}
              onReassign={handleReassign}
              onlyUnanswered={onlyUnanswered}
              onToggleOnlyUnanswered={() => setOnlyUnanswered((v) => !v)}
            />
          </>
        )}
      </div>
    </>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">{message}</p>
  )
}

function StatsRow({
  openCount,
  unassignedCount,
  unreadCount,
  agentCount,
}: {
  openCount: number
  unassignedCount: number
  unreadCount: number
  agentCount: number
}) {
  const stats = [
    { label: 'Chats abiertos', value: openCount, icon: MessagesSquare, tone: 'text-foreground' },
    { label: 'Libres (sin asignar)', value: unassignedCount, icon: Inbox, tone: unassignedCount > 0 ? 'text-warning' : 'text-foreground' },
    { label: 'Sin contestar (equipo)', value: unreadCount, icon: Bot, tone: unreadCount > 0 ? 'text-primary' : 'text-foreground' },
    { label: 'Asesores activos', value: agentCount, icon: User, tone: 'text-foreground' },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((s) => (
        <article
          key={s.label}
          className="flex flex-col justify-between rounded-lg border border-border bg-card p-4 shadow-[0_2px_0_0_oklch(0_0_0/0.4)]"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <s.icon className={cn('h-3.5 w-3.5', s.tone)} />
          </div>
          <p className={cn('mt-2 font-mono text-2xl font-bold tabular-nums leading-none', s.tone)}>{s.value}</p>
        </article>
      ))}
    </div>
  )
}

// "0" está bien como número real (nadie respondió mensajes ayer): la
// diferencia real con "sin dato" es null/undefined, no 0 — por eso no se
// puede reusar directo el percentTrend de dashboard/kpis (ese asume que
// "hoy" y "ayer" siempre existen).
function trendPercent(today: number, yesterday: number): number | null {
  if (yesterday === 0) return today > 0 ? 100 : null
  return Math.round(((today - yesterday) / yesterday) * 1000) / 10
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`
}

function AdvisorCard({
  agent,
  assignedCount,
  unreadCount,
  stats,
  loading,
  activo,
  onToggleActive,
}: {
  agent: Agent
  assignedCount: number
  unreadCount: number
  stats: AgentStatsDto | null
  loading: boolean
  activo: boolean | null
  onToggleActive: (next: boolean) => void
}) {
  const color = avatarColor(agent.email)

  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-[0_2px_0_0_oklch(0_0_0/0.4)]">
      <div className="flex items-center gap-2.5 border-b border-border/60 px-4 py-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
          style={{ backgroundColor: color.bg, color: color.fg }}
        >
          {agent.email.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{agent.email}</p>
          <p className="truncate text-[0.7rem] text-muted-foreground">
            {assignedCount} {assignedCount === 1 ? 'chat asignado' : 'chats asignados'}
          </p>
        </div>
        {unreadCount > 0 && (
          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-unread px-1.5 font-mono text-[0.65rem] font-bold text-primary-foreground">
            {unreadCount}
          </span>
        )}
      </div>

      {/* Activo/Inactivo controla la auto-asignación real de chats nuevos
          en n8n (ver db/asesores_schema_reference.md) — null significa que
          la tabla `asesores` no tiene fila para este asesor, no se puede
          togglear desde acá hasta que infra la cree. */}
      <button
        type="button"
        disabled={activo === null}
        onClick={() => onToggleActive(!activo)}
        className={cn(
          'group flex items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5 text-xs transition-colors disabled:cursor-default disabled:opacity-60',
          activo ? 'bg-success/10 text-success hover:bg-success/15' : 'bg-warning/10 text-warning hover:bg-warning/15',
        )}
      >
        <span className="font-medium">
          {activo === null ? 'Estado no disponible' : activo ? 'Activo' : 'Inactivo'}
        </span>
        <span
          className={cn(
            'relative h-5 w-9 shrink-0 rounded-full transition-colors group-active:scale-95',
            activo ? 'bg-success' : 'bg-muted-foreground/40',
          )}
        >
          <span
            className={cn(
              'absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-card shadow-sm transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]',
              activo ? 'translate-x-4' : 'translate-x-0',
            )}
          />
        </span>
      </button>

      {loading ? (
        <div className="flex items-center justify-center gap-2 px-4 py-6 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Cargando métricas…
        </div>
      ) : !stats || !stats.available ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">Métricas no disponibles.</p>
      ) : (
        <div className="grid grid-cols-2 gap-px bg-border/60">
          <Metric
            icon={MessagesSquare}
            label="Respondidos hoy"
            value={String(stats.chatsRespondidos)}
            trend={trendPercent(stats.chatsRespondidos, stats.chatsRespondidosAyer)}
          />
          <Metric
            icon={Gauge}
            label="Velocidad"
            value={formatDuration(stats.velocidadRespuestaSegundos)}
            trend={
              stats.velocidadRespuestaSegundos !== null && stats.velocidadRespuestaSegundosAyer !== null
                ? trendPercent(stats.velocidadRespuestaSegundos, stats.velocidadRespuestaSegundosAyer)
                : null
            }
            invert
          />
          <Metric
            icon={Target}
            label="Tasa de respuesta"
            value={stats.tasaRespuesta !== null ? `${stats.tasaRespuesta}%` : '—'}
            trend={
              stats.tasaRespuesta !== null && stats.tasaRespuestaAyer !== null
                ? trendPercent(stats.tasaRespuesta, stats.tasaRespuestaAyer)
                : null
            }
          />
          <Metric
            icon={Clock}
            label="Tiempo muerto"
            value={formatDuration(stats.tiempoMuertoSegundos)}
            trend={trendPercent(stats.tiempoMuertoSegundos, stats.tiempoMuertoSegundosAyer)}
            invert
          />
        </div>
      )}
    </article>
  )
}

// `invert`: para "velocidad" y "tiempo muerto", MENOS es mejor — una flecha
// hacia arriba (más segundos que ayer) se pinta como advertencia, no como
// logro, al revés que en "respondidos" y "tasa de respuesta".
function Metric({
  icon: Icon,
  label,
  value,
  trend,
  invert = false,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  trend: number | null
  invert?: boolean
}) {
  const isGood = trend !== null && (invert ? trend <= 0 : trend >= 0)
  const TrendIcon = trend !== null && trend >= 0 ? TrendingUp : TrendingDown
  return (
    <div className="flex flex-col gap-1 bg-card px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3 w-3" />
        <span className="text-[0.65rem]">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-base font-bold tabular-nums text-foreground">{value}</span>
        {trend !== null && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-[0.65rem] font-semibold',
              isGood ? 'text-success' : 'text-warning',
            )}
          >
            <TrendIcon className="h-2.5 w-2.5" />
            {Math.abs(trend)}%
          </span>
        )}
      </div>
    </div>
  )
}

function UnassignedSection({
  conversations,
  totalCount,
  agents,
  reassigningId,
  onReassign,
  onlyUnanswered,
  onToggleOnlyUnanswered,
}: {
  conversations: ChatwootConversation[]
  totalCount: number
  agents: Agent[]
  reassigningId: string | null
  onReassign: (conversationId: string, agentId: number | null) => void
  onlyUnanswered: boolean
  onToggleOnlyUnanswered: () => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="heading-stamp flex items-center gap-2 text-sm text-muted-foreground">
          <Inbox className="h-3.5 w-3.5" />
          Libres — sin asignar
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {totalCount}
          </span>
        </h2>
        <button
          type="button"
          onClick={onToggleOnlyUnanswered}
          aria-pressed={onlyUnanswered}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            onlyUnanswered
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border bg-card text-muted-foreground hover:text-foreground',
          )}
        >
          <Bot className="h-3 w-3" />
          Sin contestar
        </button>
      </div>
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-12 text-center">
              <MessagesSquare className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                {onlyUnanswered ? 'No hay chats libres sin contestar.' : 'No hay chats libres en este momento.'}
              </p>
            </div>
          ) : (
            conversations.map((c) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                agents={agents}
                reassigning={reassigningId === c.id}
                onReassign={(agentId) => onReassign(c.id, agentId)}
              />
            ))
          )}
        </div>
      </section>
    </div>
  )
}

function ConversationRow({
  conversation,
  agents,
  reassigning,
  onReassign,
}: {
  conversation: ChatwootConversation
  agents: Agent[]
  reassigning: boolean
  onReassign: (agentId: number | null) => void
}) {
  const color = avatarColor(conversation.phone || conversation.contactName)
  return (
    <div className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5 last:border-b-0">
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1 ring-border"
        style={{ backgroundColor: color.bg, color: color.fg }}
      >
        {conversation.contactName.charAt(0)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium text-foreground">{conversation.contactName}</p>
          {conversation.unreadCount > 0 && (
            <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-unread px-1 font-mono text-[0.6rem] font-bold text-primary-foreground">
              {conversation.unreadCount}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{conversation.lastMessage}</p>
      </div>
      <span
        className={cn(
          'hidden shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.6rem] font-medium sm:inline-flex',
          conversation.handledBy === 'ai' ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning',
        )}
      >
        {conversation.handledBy === 'ai' ? <Bot className="h-2.5 w-2.5" /> : <User className="h-2.5 w-2.5" />}
        {conversation.handledBy === 'ai' ? 'IA' : 'Asesor'}
      </span>
      <AssignPicker
        conversation={conversation}
        agents={agents}
        disabled={reassigning}
        loading={reassigning}
        onReassign={onReassign}
      />
    </div>
  )
}

// Mismo patrón visual que el selector "Asignar" de components/chat/chat-panel.tsx
// (botón + popover) en vez de un <select> nativo — encaja con el resto de
// la interfaz y dice claramente a quién está asignado hoy sin abrir nada.
function AssignPicker({
  conversation,
  agents,
  disabled,
  loading,
  onReassign,
}: {
  conversation: ChatwootConversation
  agents: Agent[]
  disabled: boolean
  loading: boolean
  onReassign: (agentId: number | null) => void
}) {
  const [open, setOpen] = useState(false)
  const current = agents.find((a) => a.chatwootAgentId === conversation.assigneeId)
  const currentLabel = current ? current.email.split('@')[0] : 'Sin asignar'

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <span className="max-w-24 truncate">{currentLabel}</span>
        )}
        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Cerrar selector de asesor"
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-lg border border-border bg-popover shadow-2xl shadow-black/50">
            <button
              type="button"
              onClick={() => {
                onReassign(null)
                setOpen(false)
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {conversation.assigneeId === null && <Check className="h-3.5 w-3.5 text-primary" />}
              <span className={conversation.assigneeId !== null ? 'pl-[1.375rem]' : ''}>Sin asignar</span>
            </button>
            <div className="max-h-56 overflow-y-auto border-t border-border py-1">
              {agents.map((a) => {
                const isCurrent = a.chatwootAgentId === conversation.assigneeId
                return (
                  <button
                    key={a.email}
                    type="button"
                    disabled={isCurrent}
                    onClick={() => {
                      onReassign(a.chatwootAgentId)
                      setOpen(false)
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-secondary disabled:cursor-default',
                      isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {isCurrent && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                    <span className={cn('truncate', !isCurrent && 'pl-[1.375rem]')}>{a.email}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
