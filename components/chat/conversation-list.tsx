'use client'

import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  Bot,
  Check,
  ChevronDown,
  Filter,
  Mail,
  MessageSquarePlus,
  Search,
  Tag,
  User,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ChatwootConversation } from '@/lib/types/chatwoot'
import type { ChatwootLabel } from '@/lib/api/chatwoot'
import { avatarColor } from '@/lib/avatar-color'
import { useAuth } from '@/lib/hooks/use-auth'
import { cn } from '@/lib/utils'

interface ConversationListProps {
  conversations: ChatwootConversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNewChat: () => void
  /** Clic derecho en un chat ya leído → "Marcar como no leído" (ver matchesStatus más abajo). */
  onMarkUnread: (id: string) => Promise<{ error: string } | { ok: true }>
  labelCatalog: ChatwootLabel[]
  labelCatalogLoading: boolean
}

type StatusKey = 'pending' | 'open_human' | 'unassigned' | 'resolved'

const STATUS_FILTERS: { key: StatusKey; label: string }[] = [
  { key: 'pending', label: 'Sin contestar' },
  { key: 'open_human', label: 'Abiertas' },
  { key: 'unassigned', label: 'Libres' },
  { key: 'resolved', label: 'Cerrados' },
]

// Preferencia personal, no un filtro que oculte nada — por eso vive aparte
// de statusFilter/categoryFilters (no se toca con "Limpiar filtros") y se
// guarda en localStorage para que cada asesor la vea a su gusto en cada
// visita, no solo en la sesión actual.
type SortOrder = 'asc' | 'desc'
const SORT_ORDER_KEY = 'sbk:chat-sort-order'
// Etiquetas explícitas sobre "llegada" — el criterio de este orden es
// SIEMPRE createdAt (cuándo se abrió la conversación, a propósito, ver el
// comentario grande de más abajo), nunca lastMessageAt (que es lo que
// muestra la hora de cada fila). Decirlo así en la propia etiqueta evita
// que un asesor lea "Más nuevos primero" como "el que más recientemente
// escribió arriba" — eso es la hora que VE en la fila, no el criterio de
// orden.
const SORT_OPTIONS: { key: SortOrder; label: string; icon: typeof ArrowUpNarrowWide }[] = [
  { key: 'asc', label: 'Los que llegaron primero, arriba', icon: ArrowUpNarrowWide },
  { key: 'desc', label: 'Los que llegaron último, arriba', icon: ArrowDownNarrowWide },
]

// Reglas del negocio (2026-08-12, corregida 2026-08-13, personalizada por
// asesor 2026-08-12, corregida de nuevo 2026-08-12 — "Sin contestar" NO es
// lo sin asignar, es lo YA asignado que nadie contestó todavía):
//   "Sin contestar" y "Abiertas" son EXCLUYENTES entre sí y solo cubren
//     conversaciones YA ASIGNADAS (a alguien) — lo sin asignar vive aparte,
//     en "Libres". Se parten según si tienen mensajes nuevos sin atender:
//       - "Sin contestar" = asignada (a quien sea) Y con mensajes sin leer.
//       - "Abiertas"      = asignada (a quien sea) Y ya al día (sin leer = 0).
//     Para un ASESOR, "a quien sea" se reduce a "a mí" — cada uno ve ahí
//     solo lo suyo. Para el ADMIN (supervisor), es "a cualquiera" — ve el
//     estado de TODO el equipo en ambos tabs, no solo lo sin asignar como
//     antes (eso ya lo cubre "Libres" aparte, ver más abajo). Un asesor sin
//     agente de Chatwoot vinculado (myAgentId null) no puede "tener" nada
//     asignado — sin la comprobación explícita de myAgentId,
//     `assigneeId === myAgentId` sería `null === null` y le mostraría TODO
//     lo sin asignar como si fuera suyo.
//   "Libres" (nuevo, corregida 2026-08-12) — abierta, SIN asignar Y con
//     mensajes sin leer (no cualquier chat sin asignar — eso ya lo cubre
//     "Todos", que muestra todo sin filtrar). Sin exigir sin leer, "Libres"
//     terminaba mostrando lo mismo que "Todos" filtrado apenas por
//     asignación, lo cual confundía a simple vista. Con esto, "Libres" es
//     de verdad "nadie lo tiene Y nadie lo atendió todavía" — el mismo
//     criterio de la vieja "Sin contestar" global, ahora con nombre propio.
//     Sin esto, con las dos de arriba restringidas a "lo mío", un asesor no
//     tenía forma de ver ni tomar un chat nuevo por su cuenta — dependía de
//     que un admin se lo asignara a mano desde el Centro de Control. Este
//     tab mantiene el "Intervenir" de toda la vida como autoservicio.
//   "Cerrados" — resuelta. Hoy la única forma de resolver una conversación
//     desde este sistema es cerrar una venta (ver
//     app/api/chatwoot/conversations/[id]/close/route.ts), así que ya
//     coincide con "cuando cierran una venta" sin necesidad de otro campo.
function matchesStatus(
  c: ChatwootConversation,
  status: StatusKey,
  myAgentId: number | null,
  isAdmin: boolean,
) {
  const assigneeId = c.assigneeId ?? null
  const isMine = myAgentId !== null && assigneeId === myAgentId
  switch (status) {
    case 'unassigned':
      return c.status === 'open' && assigneeId === null && c.unreadCount > 0
    case 'pending':
      if (c.status !== 'open' || assigneeId === null) return false
      return (isAdmin || isMine) && c.unreadCount > 0
    case 'open_human':
      if (c.status !== 'open' || assigneeId === null) return false
      return (isAdmin || isMine) && c.unreadCount === 0
    case 'resolved':
      return c.status === 'resolved'
  }
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onMarkUnread,
  labelCatalog,
  labelCatalogLoading,
}: ConversationListProps) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const myAgentId = user?.chatwootAgentId ?? null

  const [search, setSearch] = useState('')
  // null = "Todos" (default). Estado y categorías se combinan con AND —
  // dentro de categorías, cualquiera de las seleccionadas cuenta (OR).
  const [statusFilter, setStatusFilter] = useState<StatusKey | null>(null)
  const [categoryFilters, setCategoryFilters] = useState<string[]>([])
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')
  const [filterMenuOpen, setFilterMenuOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; conversationId: string } | null>(
    null,
  )

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SORT_ORDER_KEY)
      if (saved === 'asc' || saved === 'desc') setSortOrder(saved)
    } catch {
      // localStorage deshabilitado (modo privado, etc.) — se queda en el
      // orden por defecto, sin persistencia entre visitas.
    }
  }, [])

  function handleSortOrderChange(next: SortOrder) {
    setSortOrder(next)
    try {
      localStorage.setItem(SORT_ORDER_KEY, next)
    } catch {
      // ver comentario del efecto de arriba
    }
  }

  function toggleCategory(title: string) {
    setCategoryFilters((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title],
    )
  }

  // Clic derecho (o mantener presionado en móvil) sobre un chat — mismo
  // patrón que "Responder" en components/chat/message-bubble.tsx.
  function handleContextMenu(e: React.MouseEvent, id: string) {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, conversationId: id })
  }

  function handleMarkUnread() {
    if (!contextMenu) return
    void onMarkUnread(contextMenu.conversationId)
    setContextMenu(null)
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
    if (statusFilter && !matchesStatus(c, statusFilter, myAgentId, isAdmin)) return false
    if (categoryFilters.length > 0 && !categoryFilters.some((cat) => c.labels.includes(cat))) {
      return false
    }
    return true
  })

  // Por orden de llegada (createdAt) — mismo criterio que sweepConversations
  // en lib/api/chatwoot-sync.ts, que ya entrega la lista en ascendente. Se
  // reordena igual acá (en vez de confiar en que ya venga así) para no
  // depender del orden exacto que traiga el servidor, y para poder invertirla
  // sin tocar nada del lado del backend.
  const sorted = [...filtered].sort((a, b) => {
    const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    return sortOrder === 'asc' ? diff : -diff
  })

  // Un conteo por cada filtro de estado (no solo "Sin contestar") — reusa
  // matchesStatus en vez de repetir la condición a mano, para que estos
  // badges nunca queden desincronizados de lo que el filtro realmente
  // muestra al hacer clic. El de "Sin contestar" es el que se muestra en el
  // botón "Filtros" cerrado (el más urgente de vigilar); el resto solo se
  // ve al abrir el menú.
  const statusCounts = Object.fromEntries(
    STATUS_FILTERS.map((f) => [f.key, conversations.filter((c) => matchesStatus(c, f.key, myAgentId, isAdmin)).length]),
  ) as Record<StatusKey, number>
  const pendingChatsCount = statusCounts.pending

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
            {pendingChatsCount > 0 && (
              <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-unread px-1 font-mono text-[0.6rem] font-bold text-primary-foreground">
                {pendingChatsCount}
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
                        {statusCounts[f.key] > 0 && (
                          <span className="shrink-0 rounded bg-secondary px-1 py-0.5 text-[0.6rem] font-normal text-muted-foreground">
                            {statusCounts[f.key]}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  <div className="border-b border-border px-3 py-2">
                    <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                      Orden de llegada
                    </p>
                    <p className="mb-1.5 px-2 text-[0.65rem] text-muted-foreground">
                      La hora en cada chat es de su último mensaje — este orden es de cuándo llegó, no de esa hora.
                    </p>
                    {SORT_OPTIONS.map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => handleSortOrderChange(opt.key)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary',
                          sortOrder === opt.key ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        <opt.icon
                          className={cn('h-3.5 w-3.5 shrink-0', sortOrder === opt.key ? 'text-primary' : 'text-muted-foreground')}
                        />
                        <span className="flex-1 truncate">{opt.label}</span>
                        {sortOrder === opt.key && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
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
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {search ? 'Sin resultados' : 'No hay conversaciones'}
            </p>
          </div>
        ) : (
          sorted.map((c, i) => {
            const isActive = c.id === activeId
            const color = avatarColor(c.phone || c.contactName)
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                onContextMenu={(e) => handleContextMenu(e, c.id)}
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

      {contextMenu &&
        conversations.find((c) => c.id === contextMenu.conversationId)?.unreadCount === 0 &&
        createPortal(
          <>
            <button
              type="button"
              aria-label="Cerrar menú"
              className="fixed inset-0 z-40"
              onClick={() => setContextMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault()
                setContextMenu(null)
              }}
            />
            {/* Portal a document.body por el mismo motivo que el menú de
                "Responder" en message-bubble.tsx: un ancestro con
                `transform` (acá no hay, pero mantiene el mismo patrón)
                rompería el `fixed` si el menú viviera dentro del árbol. */}
            <div
              role="menu"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              className="fixed z-50 overflow-hidden rounded-lg border border-border bg-popover shadow-2xl shadow-black/50"
            >
              <button
                type="button"
                role="menuitem"
                onClick={handleMarkUnread}
                className="flex items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary"
              >
                <Mail className="h-3.5 w-3.5" />
                Marcar como no leído
              </button>
            </div>
          </>,
          document.body,
        )}
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
