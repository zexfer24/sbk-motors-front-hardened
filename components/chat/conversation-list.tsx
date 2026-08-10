'use client'

import { Bot, MessageSquarePlus, Search, User, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ChatwootConversation } from '@/lib/types/chatwoot'
import { avatarColor } from '@/lib/avatar-color'
import { cn } from '@/lib/utils'

interface ConversationListProps {
  conversations: ChatwootConversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNewChat: () => void
}

type FilterKey = 'pending' | 'open_human' | 'open_ai' | 'resolved' | 'all'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'pending', label: 'Sin contestar' },
  { key: 'open_human', label: 'Abiertas' },
  { key: 'open_ai', label: 'IA' },
  { key: 'resolved', label: 'Cerrados' },
  { key: 'all', label: 'Todas' },
]

// "Sin contestar" = tiene mensajes sin leer Y un asesor humano lo está
// interviniendo (si lo sigue manejando Santiago/IA no cuenta como
// "sin contestar": la IA ya se está haciendo cargo).
function matchesFilter(c: ChatwootConversation, filter: FilterKey) {
  switch (filter) {
    case 'all':
      return true
    case 'pending':
      return c.handledBy === 'human' && c.unreadCount > 0
    case 'open_human':
      return c.status === 'open' && c.handledBy === 'human'
    case 'open_ai':
      return c.status === 'open' && c.handledBy === 'ai'
    case 'resolved':
      return c.status === 'resolved'
  }
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNewChat,
}: ConversationListProps) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const filterBarRef = useRef<HTMLDivElement>(null)

  // La barra de filtros solo se desplaza horizontalmente (overflow-x-auto)
  // pero la rueda del mouse manda scroll vertical por defecto — sin esto,
  // scrollear encima no hacía nada visible (no hay overflow-y) y el gesto
  // se lo quedaba el contenedor padre. Se necesita addEventListener nativo
  // con passive:false (no el onWheel de React, que es pasivo por defecto)
  // para poder cancelar el scroll vertical y aplicarlo como horizontal.
  useEffect(() => {
    const el = filterBarRef.current
    if (!el) return
    function handleWheel(e: WheelEvent) {
      if (e.deltaY === 0) return
      el!.scrollLeft += e.deltaY
      e.preventDefault()
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  const filtered = conversations.filter((c) => {
    const matchesSearch =
      c.contactName.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search)
    return matchesSearch && matchesFilter(c, filter)
  })

  const unreadChatsCount = conversations.filter(
    (c) => c.handledBy === 'human' && c.unreadCount > 0,
  ).length

  return (
    <aside className="flex h-full w-full flex-col">
      <div className="border-b border-border p-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conversación..."
              aria-label="Buscar conversación"
              className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-8 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-shadow focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label="Limpiar búsqueda"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onNewChat}
            title="Nuevo chat"
            aria-label="Nuevo chat"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-transform active:scale-95"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </button>
        </div>

        <div ref={filterBarRef} className="mt-2 flex gap-1 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                'shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-[0.65rem] font-medium uppercase tracking-wider transition-colors',
                filter === f.key
                  ? 'bg-primary/15 text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f.key === 'pending' ? (
                <span className="inline-flex items-center gap-1">
                  {f.label}
                  <span className="rounded bg-background/60 px-1 py-0.5 text-[0.55rem] font-normal normal-case tracking-normal text-muted-foreground">
                    ({unreadChatsCount} no leídos)
                  </span>
                </span>
              ) : (
                f.label
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {search ? 'Sin resultados' : 'No hay conversaciones'}
            </p>
          </div>
        ) : (
          filtered.map((c, i) => {
            const isActive = c.id === activeId
            const color = avatarColor(c.phone || c.contactName)
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                style={{ animationDelay: `${Math.min(i, 20) * 40}ms` }}
                className={cn(
                  'animate-row-assemble flex items-start gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors w-full',
                  isActive ? 'bg-primary/10' : 'hover:bg-secondary/60',
                )}
              >
                <div className="relative shrink-0">
                  {c.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.avatarUrl}
                      alt=""
                      className="h-11 w-11 rounded-full object-cover ring-1 ring-border"
                    />
                  ) : (
                    <div
                      className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold ring-1 ring-border"
                      style={{ backgroundColor: color.bg, color: color.fg }}
                    >
                      {c.contactName.charAt(0)}
                    </div>
                  )}
                  {c.online && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-sidebar bg-success" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {c.contactName}
                    </p>
                    <span className="shrink-0 font-mono text-[0.65rem] text-muted-foreground">
                      {formatTime(c.lastMessageAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-muted-foreground">
                      {c.typing ? (
                        <span className="text-success">escribiendo…</span>
                      ) : (
                        c.lastMessage
                      )}
                    </p>
                    {c.unreadCount > 0 && (
                      <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 font-mono text-[0.6rem] font-bold text-primary-foreground">
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-1">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.6rem] font-medium',
                        c.handledBy === 'ai'
                          ? 'bg-success/15 text-success'
                          : 'bg-warning/15 text-warning',
                      )}
                    >
                      {c.handledBy === 'ai' ? (
                        <Bot className="h-2.5 w-2.5" />
                      ) : (
                        <User className="h-2.5 w-2.5" />
                      )}
                      {c.handledBy === 'ai' ? 'IA' : 'Asesor'}
                    </span>
                    {c.inboxName && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-1.5 py-0.5 text-[0.6rem] font-medium text-muted-foreground">
                        {c.inboxName}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
    </aside>
  )
}

function formatTime(iso: string | null) {
  if (!iso) return ''
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return 'ahora'
  if (diffMin < 60) return `${diffMin}min`

  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return 'ayer'
  return date.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' })
}
