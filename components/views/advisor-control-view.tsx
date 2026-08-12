'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bot, Check, ChevronDown, Inbox, Loader2, MessagesSquare, User, UserCog, Users } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { useChatwoot } from '@/lib/hooks/use-chatwoot'
import { assignConversation, fetchAgents, type Agent } from '@/lib/api/chatwoot'
import type { ChatwootConversation } from '@/lib/types/chatwoot'
import { avatarColor } from '@/lib/avatar-color'
import { cn } from '@/lib/utils'

// "Libres" se trata como una cola más en la lista de la izquierda, igual
// que la de cada asesor — así seleccionar cualquiera de las dos usa el
// mismo componente de detalle a la derecha (master-detail, como
// ConversationList + ChatPanel en WhatsApp) en vez de apilar todo en una
// sola página larga.
type QueueKey = 'unassigned' | number

// Admin-only (ver app/page.tsx) — muestra qué tiene cada asesor asignado
// hoy y deja reasignar cualquier chat abierto sin pasar por Intervenir. Ver
// components/chat/conversation-list.tsx (matchesStatus) para la contraparte:
// desde acá se ve y reparte todo; los asesores solo ven lo suyo + "Libres".
export function AdvisorControlView({ active = true }: { active?: boolean }) {
  const { conversations, loading: conversationsLoading, reload } = useChatwoot(active)
  const [agents, setAgents] = useState<Agent[] | null>(null)
  const [agentsError, setAgentsError] = useState<string | null>(null)
  const [reassigningId, setReassigningId] = useState<string | null>(null)
  const [reassignError, setReassignError] = useState<string | null>(null)
  const [selectedQueue, setSelectedQueue] = useState<QueueKey>('unassigned')

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
  const unassigned = open.filter((c) => c.assigneeId == null)
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

  const totalUnread = open.filter((c) => c.unreadCount > 0).length
  const loading = conversationsLoading && conversations.length === 0

  const activeAgent =
    typeof selectedQueue === 'number' ? linkedAgents.find((a) => a.chatwootAgentId === selectedQueue) ?? null : null
  const activeConversations = selectedQueue === 'unassigned' ? unassigned : byAgent.get(selectedQueue) ?? []

  return (
    <>
      <PageHeader eyebrow="Supervisión" title="Centro de control de asesores" />

      <div className="flex flex-1 flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        {agentsError && <ErrorBanner message={agentsError} />}
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

            <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
              <QueueList
                unassignedCount={unassigned.length}
                agents={linkedAgents}
                byAgent={byAgent}
                selected={selectedQueue}
                onSelect={setSelectedQueue}
              />
              <QueueDetail
                queueLabel={activeAgent ? activeAgent.email : 'Libres'}
                icon={activeAgent ? UserCog : Inbox}
                conversations={activeConversations}
                agents={linkedAgents}
                reassigningId={reassigningId}
                onReassign={handleReassign}
              />
            </div>
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
    { label: 'Asesores activos', value: agentCount, icon: Users, tone: 'text-foreground' },
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

function QueueList({
  unassignedCount,
  agents,
  byAgent,
  selected,
  onSelect,
}: {
  unassignedCount: number
  agents: Agent[]
  byAgent: Map<number, ChatwootConversation[]>
  selected: QueueKey
  onSelect: (key: QueueKey) => void
}) {
  return (
    <aside className="flex shrink-0 flex-col overflow-hidden rounded-lg border border-border lg:w-72">
      <div className="max-h-56 overflow-y-auto lg:max-h-none lg:flex-1">
        <QueueListItem
          active={selected === 'unassigned'}
          onClick={() => onSelect('unassigned')}
          icon={<Inbox className="h-4 w-4" />}
          label="Libres"
          sublabel="sin asignar"
          count={unassignedCount}
          countTone={unassignedCount > 0 ? 'warning' : 'muted'}
        />
        {agents.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            Ningún asesor vinculado a Chatwoot todavía.
          </p>
        ) : (
          agents.map((a) => {
            const assigned = byAgent.get(a.chatwootAgentId!) ?? []
            const unread = assigned.filter((c) => c.unreadCount > 0).length
            return (
              <QueueListItem
                key={a.email}
                active={selected === a.chatwootAgentId}
                onClick={() => onSelect(a.chatwootAgentId!)}
                avatarSeed={a.email}
                label={a.email}
                sublabel={`${assigned.length} ${assigned.length === 1 ? 'asignado' : 'asignados'}`}
                count={unread}
                countTone="primary"
              />
            )
          })
        )}
      </div>
    </aside>
  )
}

function QueueListItem({
  active,
  onClick,
  icon,
  avatarSeed,
  label,
  sublabel,
  count,
  countTone,
}: {
  active: boolean
  onClick: () => void
  icon?: React.ReactNode
  avatarSeed?: string
  label: string
  sublabel: string
  count: number
  countTone: 'warning' | 'primary' | 'muted'
}) {
  const color = avatarSeed ? avatarColor(avatarSeed) : null
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 border-b border-border/60 px-3 py-2.5 text-left transition-colors last:border-b-0',
        active ? 'bg-primary/10' : 'hover:bg-secondary/60',
      )}
    >
      {color ? (
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
          style={{ backgroundColor: color.bg, color: color.fg }}
        >
          {label.charAt(0).toUpperCase()}
        </div>
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm', active ? 'font-semibold text-foreground' : 'text-foreground')}>
          {label}
        </p>
        <p className="truncate text-[0.7rem] text-muted-foreground">{sublabel}</p>
      </div>
      {count > 0 && (
        <span
          className={cn(
            'flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 font-mono text-[0.65rem] font-bold',
            countTone === 'warning' && 'bg-warning/15 text-warning',
            countTone === 'primary' && 'bg-unread text-primary-foreground',
            countTone === 'muted' && 'bg-secondary text-muted-foreground',
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}

function QueueDetail({
  queueLabel,
  icon: Icon,
  conversations,
  agents,
  reassigningId,
  onReassign,
}: {
  queueLabel: string
  icon: React.ComponentType<{ className?: string }>
  conversations: ChatwootConversation[]
  agents: Agent[]
  reassigningId: string | null
  onReassign: (conversationId: string, agentId: number | null) => void
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-card/50 px-4 py-3">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="heading-stamp truncate text-sm text-foreground">{queueLabel}</h2>
        <span className="ml-auto shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {conversations.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-12 text-center">
            <MessagesSquare className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No hay chats acá en este momento.</p>
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
