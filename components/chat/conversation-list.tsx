'use client'

import { Bot, Check, ChevronDown, Filter, MessageSquarePlus, Search, Tag, User, X } from 'lucide-react'
import { useState } from 'react'
import type { ChatwootConversation } from '@/lib/types/chatwoot'
import type { ChatwootLabel } from '@/lib/api/chatwoot'
import { avatarColor } from '@/lib/avatar-color'
import { cn } from '@/lib/utils'

interface ConversationListProps {
  conversations: ChatwootConversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNewChat: () => void
  labelCatalog: ChatwootLabel[]
  labelCatalogLoading: boolean
}

type StatusKey = 'pending' | 'open_human' | 'open_ai' | 'resolved'

const STATUS_FILTERS: { key: StatusKey; label: string }[] = [
  { key: 'pending', label: 'Sin contestar' },
  { key: 'open_human', label: 'Abiertas' },
  { key: 'open_ai', label: 'IA' },
  { key: 'resolved', label: 'Cerrados' },
]

// "Sin contestar" = tiene mensajes sin leer Y un asesor humano lo está
// interviniendo (si lo sigue manejando Santiago/IA no cuenta como
// "sin contestar": la IA ya se está haciendo cargo).
function matchesStatus(c: ChatwootConversation, status: StatusKey) {
  switch (status) {
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
  labelCatalog,
  labelCatalogLoading,
}: ConversationListProps) {
  const [search, setSearch] = useState('')
  // null = "Todos" (default). Estado y categorías se combinan con AND —
  // dentro de categorías, cualquiera de las seleccionadas cuenta (OR).
  const [statusFilter, setStatusFilter] = useState<StatusKey | null>(null)
  const [categoryFilters, setCategoryFilters] = useState<string[]>([])
  const [filterMenuOpen, setFilterMenuOpen] = useState(false)

  function toggleCategory(title: string) {
    setCategoryFilters((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title],
    )
  }

  function clearFilters() {
    setStatusFilter(null)
    setCategoryFilters([])
  }

  const filtered = conversations.filter((c) => {
    const matchesSearch =
      c.contactName.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search)
    if (!matchesSearch) return false
    if (statusFilter && !matchesStatus(c, statusFilter)) return false
    if (categoryFilters.length > 0 && !categoryFilters.some((cat) => c.labels.includes(cat))) {
      return false
    }
    return true
  })

  const unreadChatsCount = conversations.filter(
    (c) => c.handledBy === 'human' && c.unreadCount > 0,
  ).length

  const activeFilterCount = (statusFilter ? 1 : 0) + categoryFilters.length
  const filterButtonLabel =
    activeFilterCount === 0
      ? 'Todos'
      : activeFilterCount === 1
        ? (statusFilter ? STATUS_FILTERS.find((f) => f.key === statusFilter)?.label : categoryFilters[0]) ?? 'Filtros'
        : `Filtros (${activeFilterCount})`

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

        <div className="relative mt-2">
          <button
            type="button"
            onClick={() => setFilterMenuOpen((v) => !v)}
            className={cn(
              'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-[0.7rem] font-medium transition-colors',
              activeFilterCount > 0
                ? 'bg-primary/15 text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Filter className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 truncate text-left">{filterButtonLabel}</span>
            {unreadChatsCount > 0 && (
              <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-unread px-1 font-mono text-[0.6rem] font-bold text-primary-foreground">
                {unreadChatsCount}
              </span>
            )}
            <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', filterMenuOpen && 'rotate-180')} />
          </button>

          {filterMenuOpen && (
            <>
              <button
                type="button"
                aria-label="Cerrar filtros"
                className="fixed inset-0 z-40"
                onClick={() => setFilterMenuOpen(false)}
              />
              <div className="absolute left-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-lg border border-border bg-popover shadow-2xl shadow-black/50">
                <div className="max-h-80 overflow-y-auto">
                  <div className="border-b border-border px-3 py-2">
                    <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                      Estado
                    </p>
                    <button
                      type="button"
                      onClick={() => setStatusFilter(null)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary',
                        statusFilter === null ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {statusFilter === null && <Check className="h-3.5 w-3.5 text-primary" />}
                      <span className={statusFilter === null ? '' : 'pl-[1.375rem]'}>Todos</span>
                    </button>
                    {STATUS_FILTERS.map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => setStatusFilter(f.key)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary',
                          statusFilter === f.key ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {statusFilter === f.key && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                        <span className={cn('flex-1 truncate', statusFilter !== f.key && 'pl-[1.375rem]')}>
                          {f.label}
                        </span>
                        {f.key === 'pending' && unreadChatsCount > 0 && (
                          <span className="shrink-0 rounded bg-secondary px-1 py-0.5 text-[0.6rem] font-normal text-muted-foreground">
                            {unreadChatsCount}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  <div className="px-3 py-2">
                    <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                      Categorías
                    </p>
                    {labelCatalogLoading ? (
                      <p className="px-2 py-1.5 text-xs text-muted-foreground">Cargando…</p>
                    ) : labelCatalog.length === 0 ? (
                      <p className="px-2 py-1.5 text-xs text-muted-foreground">
                        Todavía no hay categorías creadas.
                      </p>
                    ) : (
                      labelCatalog.map((l) => {
                        const active = categoryFilters.includes(l.title)
                        return (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => toggleCategory(l.title)}
                            className={cn(
                              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary',
                              active ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground',
                            )}
                          >
                            {active ? (
                              <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                            ) : (
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: l.color }}
                              />
                            )}
                            <span className="flex-1 truncate">{l.title}</span>
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>

                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="flex w-full items-center justify-center gap-1.5 border-t border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                    Limpiar filtros
                  </button>
                )}
              </div>
            </>
          )}
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
                      <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-unread px-1 font-mono text-[0.6rem] font-bold text-primary-foreground">
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
                    {c.labels.length > 0 && (
                      <span className="inline-flex items-center gap-1 truncate rounded-full bg-secondary px-1.5 py-0.5 text-[0.6rem] font-medium text-muted-foreground">
                        <Tag className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">
                          {c.labels.slice(0, 2).join(', ')}
                          {c.labels.length > 2 ? ` +${c.labels.length - 2}` : ''}
                        </span>
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
