'use client'

import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Filter,
  Loader2,
  Mail,
  MessageSquarePlus,
  Search,
  Tag,
  UserCog,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ChatwootConversation } from '@/lib/types/chatwoot'
import { fetchAgents, type Agent, type ChatwootLabel } from '@/lib/api/chatwoot'
import { avatarColor } from '@/lib/avatar-color'
import { useAuth } from '@/lib/hooks/use-auth'
import { cn } from '@/lib/utils'
import { groupByReadStatus, matchesStatus, STATUS_FILTERS, type StatusKey } from '@/lib/conversation-filters'
import { formatRelativeTime } from '@/lib/relative-time'
import { normalizarTexto } from '@/lib/text-normalize'
import { MIN_SEARCH_PHRASE_LENGTH } from '@/lib/api/search-conversations-by-content'
import { splitSnippetForHighlight } from '@/lib/message-snippet'

interface ConversationListProps {
  conversations: ChatwootConversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNewChat: () => void
  /** Clic derecho en un chat ya leído → "Marcar como no leído" (ver matchesStatus más abajo). */
  onMarkUnread: (id: string) => Promise<{ error: string } | { ok: true }>
  /** Clic derecho → "Asignar a…" (solo admin, ver isAdmin más abajo) — asigna sin necesidad de abrir el chat. */
  onAssign: (conversationId: string, agentId: number | null) => Promise<{ error: string } | { ok: true }>
  labelCatalog: ChatwootLabel[]
  labelCatalogLoading: boolean
}

// Preferencia personal, no un filtro que oculte nada — por eso vive aparte
// de statusFilter/categoryFilters (no se toca con "Limpiar filtros") y se
// guarda en localStorage para que cada asesor la vea a su gusto en cada
// visita, no solo en la sesión actual.
type SortOrder = 'asc' | 'desc'
const SORT_ORDER_KEY = 'sbk:chat-sort-order'
// BUG (encontrado 2026-08-13, confirmado en producción con las 405
// conversaciones reales): el orden usaba createdAt (cuándo se abrió la
// conversación por primera vez) pero cada fila MUESTRA formatRelativeTime(lastMessageAt)
// (más abajo) — un campo distinto. Un cliente que escribió por primera vez
// hace semanas y volvió a escribir hace 4h se ordenaba por esas semanas, no
// por esas 4h: la lista saltaba sin patrón aparente para quien la mira
// ("5h, 5h, 6h, 5h, 4h..."), aunque el sort en sí funcionaba perfecto —
// por el campo equivocado. Ahora el criterio es lastMessageAt, el mismo
// campo que ya se ve en cada fila — por eso las etiquetas ya no necesitan
// aclarar "llegada" vs. "la hora que ves": ahora son lo mismo.
const SORT_OPTIONS: { key: SortOrder; label: string; icon: typeof ArrowUpNarrowWide }[] = [
  { key: 'asc', label: 'Más antiguos arriba', icon: ArrowUpNarrowWide },
  { key: 'desc', label: 'Más recientes arriba', icon: ArrowDownNarrowWide },
]

// Reglas de las pestañas de estado — ver lib/conversation-filters.ts
// (matchesStatus, STATUS_FILTERS): extraído ahí para poder probarlo sin
// renderizar React. "Sin contestar" es todo lo abierto con mensajes sin
// leer, asignado o no (ver el 2026-08-16 en ese archivo); "Abiertas" es lo
// YA ASIGNADO y al día; "Libres" (sin asignar y sin leer) es subconjunto
// de "Sin contestar"; "Cerrados" es por status.

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onMarkUnread,
  onAssign,
  labelCatalog,
  labelCatalogLoading,
}: ConversationListProps) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  // Scoped a "lo mío" a propósito para el filtro "Asignados" — ver el
  // comentario de matchesStatus en lib/conversation-filters.ts.
  const viewerAgentId = user?.chatwootAgentId ?? null

  const [search, setSearch] = useState('')
  // Ids que matchean por CONTENIDO de mensajes (no nombre/teléfono) → el
  // fragmento del mensaje real donde aparece la frase (ver buildSnippet,
  // lib/message-snippet.ts), para mostrar EN la fila dónde matchea en vez
  // del último mensaje del hilo (que puede no tener nada que ver). Ver el
  // efecto debounced más abajo y app/api/chatwoot/conversations/search-content.
  // Aparte de `filtered`/`matchesSearch` porque depende de una llamada async
  // a la DB, no de datos ya en memoria.
  const [contentMatches, setContentMatches] = useState<Map<string, string>>(new Map())
  // null = "Todos" (default). Estado y categorías se combinan con AND —
  // dentro de categorías, cualquiera de las seleccionadas cuenta (OR).
  const [statusFilter, setStatusFilter] = useState<StatusKey | null>(null)
  const [categoryFilters, setCategoryFilters] = useState<string[]>([])
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')
  const [filterMenuOpen, setFilterMenuOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; conversationId: string } | null>(
    null,
  )
  const [assignSubmenuOpen, setAssignSubmenuOpen] = useState(false)
  const [assignAgents, setAssignAgents] = useState<Agent[] | null>(null)
  const [assigning, setAssigning] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SORT_ORDER_KEY)
      if (saved === 'asc' || saved === 'desc') setSortOrder(saved)
    } catch {
      // localStorage deshabilitado (modo privado, etc.) — se queda en el
      // orden por defecto, sin persistencia entre visitas.
    }
  }, [])

  // Buscar por contenido de mensajes (no solo nombre/teléfono) requiere
  // consultar la DB de Chatwoot — a diferencia del resto del buscador, que
  // es 100% en memoria. Debounce de 300ms para no pegarle a la tabla de
  // mensajes en cada tecla, y un gate de MIN_SEARCH_PHRASE_LENGTH para no
  // buscar frases de 1-2 letras contra toda la tabla. AbortController evita
  // que una respuesta vieja (de una tecla anterior) pise el resultado de
  // la búsqueda más reciente si llegan fuera de orden.
  useEffect(() => {
    const trimmed = search.trim()
    if (trimmed.length < MIN_SEARCH_PHRASE_LENGTH) {
      setContentMatches(new Map())
      return
    }

    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetch(`/api/chatwoot/conversations/search-content?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && Array.isArray(data.matches)) {
            const matches = data.matches as { conversationId: string; snippet: string }[]
            setContentMatches(new Map(matches.map((m) => [m.conversationId, m.snippet])))
          }
        })
        .catch(() => {
          // Abortado (nueva tecla) o error de red — el filtro de
          // nombre/teléfono sigue funcionando solo, sin esto.
        })
    }, 300)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [search])

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
    setAssignSubmenuOpen(false)
    setAssignError(null)
  }

  function handleMarkUnread() {
    if (!contextMenu) return
    void onMarkUnread(contextMenu.conversationId)
    setContextMenu(null)
  }

  async function handleOpenAssignSubmenu() {
    setAssignSubmenuOpen((v) => !v)
    if (!assignAgents) {
      try {
        setAssignAgents(await fetchAgents())
      } catch {
        setAssignError('No se pudo cargar la lista de asesores.')
        setAssignAgents([])
      }
    }
  }

  async function handleAssignFromMenu(agentId: number | null) {
    if (!contextMenu) return
    setAssigning(true)
    setAssignError(null)
    try {
      const result = await onAssign(contextMenu.conversationId, agentId)
      if ('error' in result) {
        setAssignError(result.error)
        return
      }
      setContextMenu(null)
    } finally {
      setAssigning(false)
    }
  }

  function clearFilters() {
    setStatusFilter(null)
    setCategoryFilters([])
  }

  const filtered = conversations.filter((c) => {
    const matchesSearch =
      normalizarTexto(c.contactName).includes(normalizarTexto(search)) ||
      c.phone.includes(search) ||
      contentMatches.has(c.id)
    if (!matchesSearch) return false
    if (statusFilter && !matchesStatus(c, statusFilter, viewerAgentId)) return false
    if (categoryFilters.length > 0 && !categoryFilters.some((cat) => c.labels.includes(cat))) {
      return false
    }
    return true
  })

  // Por última actividad (lastMessageAt) — el mismo campo que ya se muestra
  // como la hora de cada fila (formatRelativeTime(c.lastMessageAt) más abajo), y el
  // comportamiento estándar de cualquier chat (WhatsApp incluido): el que
  // más recientemente escribió sube/baja según el toggle. Antes usaba
  // createdAt (cuándo se abrió la conversación, no cuándo fue el último
  // mensaje) — ver el comentario de SORT_OPTIONS más arriba para el bug que
  // eso causaba. lastMessageAt puede ser null (conversación sin mensajes
  // todavía) — cae a createdAt en ese caso, mismo fallback que usa
  // isBetterConversation en lib/api/chatwoot-sync.ts.
  const sorted = [...filtered].sort((a, b) => {
    const aTime = a.lastMessageAt ?? a.createdAt
    const bTime = b.lastMessageAt ?? b.createdAt
    const diff = new Date(aTime).getTime() - new Date(bTime).getTime()
    return sortOrder === 'asc' ? diff : -diff
  })

  // Un conteo por cada filtro de estado (no solo "Sin contestar") — reusa
  // matchesStatus en vez de repetir la condición a mano, para que estos
  // badges nunca queden desincronizados de lo que el filtro realmente
  // muestra al hacer clic. El de "Sin contestar" es el que se muestra en el
  // botón "Filtros" cerrado (el más urgente de vigilar); el resto solo se
  // ve al abrir el menú.
  const statusCounts = Object.fromEntries(
    STATUS_FILTERS.map((f) => [f.key, conversations.filter((c) => matchesStatus(c, f.key, viewerAgentId)).length]),
  ) as Record<StatusKey, number>
  const pendingChatsCount = statusCounts.pending

  const contextConversation = contextMenu
    ? conversations.find((c) => c.id === contextMenu.conversationId) ?? null
    : null

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
                      Orden
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
        ) : statusFilter === 'assigned' ? (
          // Dentro de "Asignados", separado en dos secciones en vez de una
          // lista plana — antes la info de leído/no-leído estaba (el badge
          // numérico de cada fila) pero el agrupamiento no era intuitivo:
          // había que leer fila por fila para separar lo urgente de lo ya
          // contestado. groupByReadStatus preserva el orden de `sorted`
          // dentro de cada sección (ver lib/conversation-filters.ts).
          (() => {
            const { unread, read } = groupByReadStatus(sorted)
            return (
              <>
                {unread.length > 0 && (
                  <ConversationSection title="No leídos" count={unread.length}>
                    {unread.map((c, i) => (
                      <ConversationRow
                        key={c.id}
                        conversation={c}
                        index={i}
                        isActive={c.id === activeId}
                        onSelect={onSelect}
                        onContextMenu={handleContextMenu}
                        searchSnippet={contentMatches.get(c.id)}
                        searchPhrase={search}
                      />
                    ))}
                  </ConversationSection>
                )}
                {read.length > 0 && (
                  <ConversationSection title="Leídos" count={read.length}>
                    {read.map((c, i) => (
                      <ConversationRow
                        key={c.id}
                        conversation={c}
                        index={i}
                        isActive={c.id === activeId}
                        onSelect={onSelect}
                        onContextMenu={handleContextMenu}
                        searchSnippet={contentMatches.get(c.id)}
                        searchPhrase={search}
                      />
                    ))}
                  </ConversationSection>
                )}
              </>
            )
          })()
        ) : (
          sorted.map((c, i) => (
            <ConversationRow
              key={c.id}
              conversation={c}
              index={i}
              isActive={c.id === activeId}
              onSelect={onSelect}
              onContextMenu={handleContextMenu}
              searchSnippet={contentMatches.get(c.id)}
              searchPhrase={search}
            />
          ))
        )}
      </div>

      {contextMenu &&
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
              className="fixed z-50 w-56 overflow-hidden rounded-lg border border-border bg-popover shadow-2xl shadow-black/50"
            >
              {contextConversation?.unreadCount === 0 && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleMarkUnread}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Marcar como no leído
                </button>
              )}

              {/* Asignar sin abrir el chat — solo admin, mismo criterio que
                  /api/chatwoot/conversations/[id]/assign (ver proxy.ts). */}
              {isAdmin && (
                <div className={contextConversation?.unreadCount === 0 ? 'border-t border-border' : ''}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleOpenAssignSubmenu}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary"
                  >
                    <UserCog className="h-3.5 w-3.5" />
                    <span className="flex-1">Asignar a…</span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>

                  {assignSubmenuOpen && (
                    <div className="max-h-56 overflow-y-auto border-t border-border py-1">
                      {assignError && <p className="px-3 py-2 text-xs text-primary">{assignError}</p>}
                      {assignAgents === null ? (
                        <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Cargando…
                        </div>
                      ) : (
                        <>
                          {contextConversation?.assigneeId !== null && (
                            <button
                              type="button"
                              disabled={assigning}
                              onClick={() => handleAssignFromMenu(null)}
                              className="flex w-full items-center gap-2 px-3 py-2 pl-8 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60"
                            >
                              Sin asignar
                            </button>
                          )}
                          {assignAgents.length === 0 ? (
                            <p className="px-3 py-2 pl-8 text-xs text-muted-foreground">
                              No hay asesores vinculados.
                            </p>
                          ) : (
                            assignAgents.map((a) => (
                              <button
                                key={a.email}
                                type="button"
                                disabled={assigning || a.chatwootAgentId === contextConversation?.assigneeId}
                                onClick={() => handleAssignFromMenu(a.chatwootAgentId)}
                                className={cn(
                                  'flex w-full items-center gap-2 truncate px-3 py-2 pl-8 text-left text-sm transition-colors hover:bg-secondary disabled:cursor-default',
                                  a.chatwootAgentId === contextConversation?.assigneeId
                                    ? 'font-semibold text-foreground'
                                    : 'text-muted-foreground hover:text-foreground',
                                )}
                              >
                                {a.email}
                              </button>
                            ))
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>,
          document.body,
        )}
    </aside>
  )
}

// Encabezado de sección dentro del filtro "Asignados" (ver el render de
// arriba) — solo texto + contador, sin controles propios.
function ConversationSection({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/60 bg-sidebar/95 px-4 py-1.5 backdrop-blur-sm">
        <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
        <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[0.6rem] font-medium text-muted-foreground">
          {count}
        </span>
      </div>
      {children}
    </div>
  )
}

// Una fila de la bandeja — extraída de ConversationList para poder
// reusarla tanto en la lista plana como en las dos secciones de "Asignados"
// (ver groupByReadStatus más arriba) sin duplicar el markup.
function ConversationRow({
  conversation: c,
  index,
  isActive,
  onSelect,
  onContextMenu,
  searchSnippet,
  searchPhrase,
}: {
  conversation: ChatwootConversation
  index: number
  isActive: boolean
  onSelect: (id: string) => void
  onContextMenu: (e: React.MouseEvent, id: string) => void
  /** Fragmento del mensaje real donde matchea la búsqueda por contenido
   * (ver contentMatches en ConversationList) — reemplaza el preview de
   * lastMessage cuando está presente, para mostrar DÓNDE aparece la frase
   * en vez del último mensaje del hilo (que puede no tener nada que ver). */
  searchSnippet?: string
  /** La frase buscada tal cual la tipeó el asesor — se usa junto con
   * searchSnippet para resaltar (splitSnippetForHighlight) dónde aparece
   * dentro del fragmento. */
  searchPhrase: string
}) {
  const color = avatarColor(c.phone || c.contactName)
  return (
    <button
      type="button"
      onClick={() => onSelect(c.id)}
      onContextMenu={(e) => onContextMenu(e, c.id)}
      style={{ animationDelay: `${Math.min(index, 20) * 40}ms` }}
      className={cn(
        'animate-row-assemble flex items-start gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors w-full',
        isActive ? 'bg-primary/10' : 'hover:bg-secondary/60',
      )}
    >
      <div className="relative shrink-0">
        {c.avatarUrl ? (

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
            {formatRelativeTime(c.lastMessageAt)}
          </span>
        </div>
        <div className="mt-0.5 flex items-start justify-between gap-2">
          <p className="flex min-w-0 items-start gap-1 text-xs text-muted-foreground">
            {/* Check/doble check estilo WhatsApp — solo cuando el ÚLTIMO
                mensaje del hilo es saliente Y no se está mostrando un
                fragmento de búsqueda (ese fragmento puede ser un mensaje
                viejo, entrante — el check no aplica ahí), ver
                lastMessageStatus en chatwoot-sync.ts / chatwoot-db.ts. Azul
                solo si el cliente ya lo leyó, mismo criterio de color que
                message-bubble.tsx. */}
            {!c.typing && !searchSnippet && c.lastMessageStatus && (
              <span
                className={cn(
                  'mt-0.5 shrink-0',
                  c.lastMessageStatus === 'read' ? 'text-[oklch(0.72_0.15_220)]' : 'text-muted-foreground',
                )}
              >
                {c.lastMessageStatus === 'sent' ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <CheckCheck className="h-3 w-3" />
                )}
              </span>
            )}
            {/* Sin badges de IA/Asesor ni de bandeja acá (se sacaron para
                dar más espacio al preview) — el mensaje puede ocupar hasta
                2 líneas (line-clamp-2) en vez de cortarse en una sola, y al
                buscar por contenido se ve el fragmento real donde aparece
                la frase en vez del último mensaje del hilo. */}
            <span className="line-clamp-2">
              {c.typing ? (
                <span className="text-success">escribiendo…</span>
              ) : searchSnippet ? (
                splitSnippetForHighlight(searchSnippet, searchPhrase).map((segment, i) =>
                  segment.highlighted ? (
                    <mark key={i} className="rounded-sm bg-warning/40 text-foreground">
                      {segment.text}
                    </mark>
                  ) : (
                    <span key={i}>{segment.text}</span>
                  ),
                )
              ) : (
                c.lastMessage
              )}
            </span>
          </p>
          {c.unreadCount > 0 && (
            <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-unread px-1 font-mono text-[0.6rem] font-bold text-primary-foreground">
              {c.unreadCount}
            </span>
          )}
        </div>
        {c.labels.length > 0 && (
          <div className="mt-1 flex items-center gap-1">
            <span className="inline-flex items-center gap-1 truncate rounded-full bg-secondary px-1.5 py-0.5 text-[0.6rem] font-medium text-muted-foreground">
              <Tag className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">
                {c.labels.slice(0, 2).join(', ')}
                {c.labels.length > 2 ? ` +${c.labels.length - 2}` : ''}
              </span>
            </span>
          </div>
        )}
      </div>
    </button>
  )
}
