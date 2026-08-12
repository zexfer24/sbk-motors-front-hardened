'use client'

import { useEffect, useState } from 'react'
import { Bot, Inbox, Loader2, User, UserCog } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { useChatwoot } from '@/lib/hooks/use-chatwoot'
import { assignConversation, fetchAgents, type Agent } from '@/lib/api/chatwoot'
import type { ChatwootConversation } from '@/lib/types/chatwoot'
import { avatarColor } from '@/lib/avatar-color'
import { cn } from '@/lib/utils'

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
  const unassigned = open.filter((c) => c.assigneeId === null)
  const linkedAgents = (agents ?? []).filter((a) => a.chatwootAgentId !== null)

  const loading = conversationsLoading && conversations.length === 0

  return (
    <>
      <PageHeader eyebrow="Supervisión" title="Centro de control de asesores" />

      <div className="flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {agentsError && (
          <p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
            {agentsError}
          </p>
        )}
        {reassignError && (
          <p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
            {reassignError}
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Inbox className="h-4 w-4 text-warning" />
                <h2 className="heading-stamp text-sm text-foreground">Libres</h2>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {unassigned.length}
                </span>
              </div>
              {unassigned.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  No hay chats sin asignar en este momento.
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  {unassigned.map((c) => (
                    <ConversationRow
                      key={c.id}
                      conversation={c}
                      agents={linkedAgents}
                      reassigning={reassigningId === c.id}
                      onReassign={(agentId) => handleReassign(c.id, agentId)}
                    />
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <UserCog className="h-4 w-4 text-primary" />
                <h2 className="heading-stamp text-sm text-foreground">Por asesor</h2>
              </div>

              {linkedAgents.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  Todavía no hay asesores vinculados a Chatwoot (ver `link-chatwoot` en scripts/manage-users.mjs).
                </p>
              ) : (
                linkedAgents.map((agent) => {
                  const assigned = open.filter((c) => c.assigneeId === agent.chatwootAgentId)
                  const unread = assigned.filter((c) => c.unreadCount > 0).length
                  return (
                    <div key={agent.email} className="overflow-hidden rounded-lg border border-border">
                      <div className="flex items-center gap-3 border-b border-border bg-card/50 px-4 py-3">
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                          style={{ backgroundColor: avatarColor(agent.email).bg, color: avatarColor(agent.email).fg }}
                        >
                          {agent.email.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">{agent.email}</p>
                          <p className="text-xs text-muted-foreground">
                            {assigned.length} {assigned.length === 1 ? 'chat asignado' : 'chats asignados'}
                            {unread > 0 && (
                              <span className="ml-1.5 font-semibold text-primary">· {unread} sin contestar</span>
                            )}
                          </p>
                        </div>
                      </div>
                      {assigned.length === 0 ? (
                        <p className="px-4 py-4 text-center text-xs text-muted-foreground">
                          Sin chats abiertos asignados.
                        </p>
                      ) : (
                        assigned.map((c) => (
                          <ConversationRow
                            key={c.id}
                            conversation={c}
                            agents={linkedAgents}
                            reassigning={reassigningId === c.id}
                            onReassign={(agentId) => handleReassign(c.id, agentId)}
                          />
                        ))
                      )}
                    </div>
                  )
                })
              )}
            </section>
          </>
        )}
      </div>
    </>
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
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1 ring-border"
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
          'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.6rem] font-medium',
          conversation.handledBy === 'ai' ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning',
        )}
      >
        {conversation.handledBy === 'ai' ? <Bot className="h-2.5 w-2.5" /> : <User className="h-2.5 w-2.5" />}
        {conversation.handledBy === 'ai' ? 'IA' : 'Asesor'}
      </span>
      <select
        value={conversation.assigneeId ?? ''}
        disabled={reassigning}
        onChange={(e) => onReassign(e.target.value ? Number(e.target.value) : null)}
        aria-label={`Reasignar chat de ${conversation.contactName}`}
        className="shrink-0 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground outline-none disabled:opacity-50"
      >
        <option value="">Sin asignar</option>
        {agents.map((a) => (
          <option key={a.email} value={a.chatwootAgentId ?? ''}>
            {a.email}
          </option>
        ))}
      </select>
    </div>
  )
}
