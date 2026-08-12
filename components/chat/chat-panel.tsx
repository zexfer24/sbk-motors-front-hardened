'use client'

import { useRef, useState, useEffect, useLayoutEffect, useMemo } from 'react'
import {
  ArrowLeft,
  Bot,
  Clock,
  Hand,
  Handshake,
  Loader2,
  MessageSquareText,
  Paperclip,
  Phone,
  Reply,
  Settings2,
  SendHorizonal,
  Tag,
  UserCog,
  X,
} from 'lucide-react'
import type { ChatwootConversation, ChatwootMessage } from '@/lib/types/chatwoot'
import type { NewOrderDb } from '@/lib/types/order'
import { MessageBubble } from '@/components/chat/message-bubble'
import { CloseSaleModal } from '@/components/chat/close-sale-modal'
import { QuickRepliesManagerModal } from '@/components/chat/quick-replies-manager-modal'
import { LabelsManagerModal } from '@/components/chat/labels-manager-modal'
import { avatarColor } from '@/lib/avatar-color'
import { useAuth } from '@/lib/hooks/use-auth'
import { useQuickReplies } from '@/lib/hooks/use-quick-replies'
import { fetchAgents, type Agent, type ChatwootLabel } from '@/lib/api/chatwoot'
import { cn } from '@/lib/utils'

// Alto máximo del compositor antes de que aparezca su propio scroll interno
// (~5 líneas de texto). Crece con auto-resize hasta ahí, ver el useEffect
// más abajo que sincroniza `style.height` con `scrollHeight`.
const COMPOSER_MAX_HEIGHT_PX = 128

// Ventana de servicio de WhatsApp: Meta solo deja mandar mensaje libre
// (fuera de plantilla) dentro de las 24h desde el ÚLTIMO mensaje entrante
// del cliente. Pasado ese plazo, un mensaje normal falla del lado de Meta —
// mejor avisarlo acá que dejar que el asesor lo descubra con un error
// críptico de Chatwoot.
const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000

function lastIncomingMessage(messages: ChatwootMessage[]): ChatwootMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].messageType === 'incoming') return messages[i]
  }
  return null
}

function formatRemaining(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours <= 0) return `${minutes} min`
  return `${hours} h ${minutes} min`
}

interface ChatPanelProps {
  conversation: ChatwootConversation
  messages: ChatwootMessage[]
  hasMoreMessages: boolean
  loadingOlderMessages: boolean
  onLoadOlderMessages: () => void
  intervened: boolean
  onBack: () => void
  onSend: (text: string, inReplyTo?: string) => void
  onSendImage: (file: File, caption?: string, inReplyTo?: string) => Promise<void>
  onToggleIntervene: () => Promise<{ error: string } | { ok: true }>
  onAssign: (agentId: number | null) => Promise<{ error: string } | { ok: true }>
  onSetLabels: (labels: string[]) => Promise<{ error: string } | { ok: true }>
  labelCatalog: ChatwootLabel[]
  labelCatalogLoading: boolean
  onCreateLabel: (input: { title: string; color: string }) => Promise<ChatwootLabel | { error: string }>
  onCloseSale: (input: NewOrderDb) => Promise<{ error: string } | { ok: true }>
}

export function ChatPanel({
  conversation,
  messages,
  hasMoreMessages,
  loadingOlderMessages,
  onLoadOlderMessages,
  intervened,
  onBack,
  onSend,
  onSendImage,
  onToggleIntervene,
  onAssign,
  onSetLabels,
  labelCatalog,
  labelCatalogLoading,
  onCreateLabel,
  onCloseSale,
}: ChatPanelProps) {
  const [draft, setDraft] = useState('')
  const [closeSaleOpen, setCloseSaleOpen] = useState(false)
  const [imageUploading, setImageUploading] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [quickRepliesOpen, setQuickRepliesOpen] = useState(false)
  const [quickRepliesManagerOpen, setQuickRepliesManagerOpen] = useState(false)
  const [interveneLoading, setInterveneLoading] = useState(false)
  const [interveneError, setInterveneError] = useState<string | null>(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignLoading, setAssignLoading] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)
  const [agents, setAgents] = useState<Agent[] | null>(null)
  const [labelsPickerOpen, setLabelsPickerOpen] = useState(false)
  const [labelsSaving, setLabelsSaving] = useState(false)
  const [labelsError, setLabelsError] = useState<string | null>(null)
  const [labelsManagerOpen, setLabelsManagerOpen] = useState(false)
  const [replyTarget, setReplyTarget] = useState<ChatwootMessage | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lastMessageIdRef = useRef<string | null>(null)
  const pendingRestoreRef = useRef<{ prevScrollHeight: number; prevScrollTop: number } | null>(null)
  const { user } = useAuth()
  const {
    replies: quickReplies,
    loading: quickRepliesLoading,
    create: createQuickReply,
    update: updateQuickReply,
    remove: removeQuickReply,
  } = useQuickReplies()

  // Para resolver de qué mensaje es "respuesta" un mensaje citado sin
  // pedirle nada extra a Chatwoot — la cita casi siempre apunta a algo que
  // ya está en esta misma tanda cargada.
  const messagesById = useMemo(() => {
    const map = new Map<string, ChatwootMessage>()
    for (const m of messages) map.set(m.id, m)
    return map
  }, [messages])

  // El objetivo de "responder" es de la conversación anterior si no se
  // limpia al cambiar de chat — se vería el banner de "Respondiendo a..."
  // apuntando a un mensaje de otra persona.
  useEffect(() => {
    setReplyTarget(null)
  }, [conversation.id])

  // Solo baja el scroll cuando cambia el ÚLTIMO mensaje (uno nuevo llegó o
  // se mandó) — si lo que cambió fue anteponer mensajes viejos al abrir
  // historial hacia arriba, el último sigue siendo el mismo y no hay que
  // saltar de vuelta al fondo, eso arruinaría el "cargar más" (ver
  // handleScroll más abajo).
  useEffect(() => {
    const lastId = messages[messages.length - 1]?.id ?? null
    if (lastId !== lastMessageIdRef.current) {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth',
      })
    }
    lastMessageIdRef.current = lastId
  }, [messages])

  // La restauración de posición corre en un layout effect (antes de pintar)
  // en vez de en el then() del fetch — para cuando la promesa resuelve y
  // React re-renderiza con los mensajes de más, este efecto ya puede leer
  // el scrollHeight nuevo y corregir el salto antes de que se vea.
  useLayoutEffect(() => {
    const el = scrollRef.current
    const pending = pendingRestoreRef.current
    if (!el || !pending) return
    el.scrollTop = el.scrollHeight - pending.prevScrollHeight + pending.prevScrollTop
    pendingRestoreRef.current = null
  }, [messages])

  // Al acercarse al tope del historial, pide la tanda anterior y preserva
  // la posición visual: sin esto, anteponer mensajes arriba empuja todo
  // hacia abajo y el usuario pierde de vista lo que estaba leyendo.
  function handleScroll() {
    const el = scrollRef.current
    if (!el || el.scrollTop > 80 || loadingOlderMessages || !hasMoreMessages) return
    pendingRestoreRef.current = { prevScrollHeight: el.scrollHeight, prevScrollTop: el.scrollTop }
    onLoadOlderMessages()
  }

  // El compositor crece con el contenido (hasta COMPOSER_MAX_HEIGHT_PX) en
  // vez de quedarse fijo en una línea — así el salto de línea manual
  // (Ctrl+J / Shift+Enter, ver handleComposerKeyDown) se ve mientras se
  // escribe, no solo al enviar.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT_PX)}px`
  }, [draft])

  // Foco automático al entrar a una conversación distinta — así se puede
  // empezar a escribir de una vez, sin tener que hacer clic en el input.
  useEffect(() => {
    if (conversation.canWrite) textareaRef.current?.focus()
  }, [conversation.id, conversation.canWrite])

  // Ventana de 24h de WhatsApp: se recalcula en cada render a partir del
  // último mensaje entrante cargado. No hay un timer que la haga "vencer"
  // sola en pantalla — el polling/SSE ya provoca renders seguido, así que
  // no vale la pena la complejidad extra de un setInterval solo para esto.
  const lastCustomerMessage = lastIncomingMessage(messages)
  const windowExpiresAt = lastCustomerMessage
    ? new Date(lastCustomerMessage.createdAt).getTime() + WHATSAPP_WINDOW_MS
    : null
  const withinWhatsappWindow = windowExpiresAt !== null && Date.now() < windowExpiresAt

  function submitDraft() {
    const text = draft.trim()
    if (!text) return
    onSend(text, replyTarget?.id)
    setDraft('')
    setReplyTarget(null)
  }

  // Solo se puede responder a un mensaje del cliente (estilo WhatsApp: no
  // tiene sentido "citar" algo que mandó el propio negocio).
  function handleReply(message: ChatwootMessage) {
    if (message.messageType !== 'incoming') return
    setReplyTarget(message)
    textareaRef.current?.focus()
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    submitDraft()
  }

  // Inserta texto en la posición del cursor (no al final) y se lo devuelve
  // ahí tras el re-render — sin esto, escribir un salto de línea a mitad de
  // un mensaje largo movería el cursor al final cada vez.
  function insertAtCursor(text: string) {
    const el = textareaRef.current
    if (!el) {
      setDraft((prev) => prev + text)
      return
    }
    const start = el.selectionStart ?? draft.length
    const end = el.selectionEnd ?? draft.length
    setDraft(draft.slice(0, start) + text + draft.slice(end))
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + text.length
    })
  }

  // Enter solo → enviar (como antes). Ctrl+J o Shift+Enter → salto de línea
  // manual: Ctrl+J se maneja a mano porque el navegador no lo trata como
  // "nueva línea" en un textarea (en Chrome, sin preventDefault, abre el
  // panel de descargas); Shift+Enter ya inserta salto de línea nativo, no
  // hace falta tocarlo.
  function handleComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key.toLowerCase() === 'j' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      insertAtCursor('\n')
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submitDraft()
    }
  }

  async function handleToggleIntervene() {
    setInterveneError(null)
    setInterveneLoading(true)
    try {
      const result = await onToggleIntervene()
      if ('error' in result) setInterveneError(result.error)
    } finally {
      setInterveneLoading(false)
    }
  }

  async function handleOpenAssign() {
    setAssignError(null)
    setAssignOpen((v) => !v)
    // Se carga perezosamente (recién al abrir el menú), no en cada render
    // del panel — es admin-only y no cambia seguido en medio de una sesión.
    if (!agents) {
      try {
        setAgents(await fetchAgents())
      } catch {
        setAssignError('No se pudo cargar la lista de asesores.')
        setAgents([])
      }
    }
  }

  async function handleAssign(agentId: number | null) {
    setAssignError(null)
    setAssignLoading(true)
    try {
      const result = await onAssign(agentId)
      if ('error' in result) setAssignError(result.error)
      else setAssignOpen(false)
    } finally {
      setAssignLoading(false)
    }
  }

  // Reemplaza el set completo (así lo espera setConversationLabels) — se
  // arma a partir del set actual, agregando o quitando solo el título que
  // se tocó.
  async function handleToggleLabel(title: string) {
    setLabelsError(null)
    const next = conversation.labels.includes(title)
      ? conversation.labels.filter((l) => l !== title)
      : [...conversation.labels, title]
    setLabelsSaving(true)
    try {
      const result = await onSetLabels(next)
      if ('error' in result) setLabelsError(result.error)
    } finally {
      setLabelsSaving(false)
    }
  }

  function handlePickImage() {
    setImageError(null)
    fileInputRef.current?.click()
  }

  async function sendImageFile(file: File) {
    setImageError(null)
    setImageUploading(true)
    const inReplyTo = replyTarget?.id
    setReplyTarget(null)
    try {
      await onSendImage(file, undefined, inReplyTo)
    } catch {
      setImageError('No se pudo enviar la imagen. Intenta de nuevo.')
    } finally {
      setImageUploading(false)
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    await sendImageFile(file)
  }

  // Pegar una imagen copiada (captura de pantalla, "Copiar imagen" del
  // navegador, etc.) manda directo por el mismo camino que adjuntar por el
  // clip — sin esto, la única forma de mandar una imagen era guardarla a
  // disco primero y elegirla con el picker de archivos.
  function handleComposerPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
      i.type.startsWith('image/'),
    )
    if (!item) return
    e.preventDefault()
    const file = item.getAsFile()
    if (file) sendImageFile(file)
  }

  function insertQuickReply(content: string) {
    setDraft(content)
    setQuickRepliesOpen(false)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-border bg-card/50 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md p-1 text-muted-foreground hover:bg-secondary md:hidden"
          aria-label="Volver a la lista"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        {conversation.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={conversation.avatarUrl}
            alt=""
            className="h-10 w-10 rounded-full object-cover ring-1 ring-border"
          />
        ) : (
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ring-1 ring-border"
            style={{
              backgroundColor: avatarColor(conversation.phone || conversation.contactName).bg,
              color: avatarColor(conversation.phone || conversation.contactName).fg,
            }}
          >
            {conversation.contactName.charAt(0)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {conversation.contactName}
          </p>
          <p className="flex items-center gap-1.5 truncate whitespace-nowrap font-mono text-xs text-muted-foreground">
            <Phone className="h-3 w-3 shrink-0" />
            {conversation.phone}
            {conversation.inboxName && (
              <span className="rounded-full bg-secondary px-1.5 py-0.5 font-sans text-[0.65rem] normal-case text-muted-foreground">
                {conversation.inboxName}
              </span>
            )}
            {conversation.typing && (
              <span className="ml-1 text-success">· escribiendo…</span>
            )}
          </p>
          {conversation.labels.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {conversation.labels.map((title) => {
                const color = labelCatalog.find((l) => l.title === title)?.color ?? '#94a3b8'
                return (
                  <span
                    key={title}
                    className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[0.6rem] font-medium"
                    style={{ borderColor: `${color}66`, color, backgroundColor: `${color}1a` }}
                  >
                    {title}
                  </span>
                )
              })}
            </div>
          )}
        </div>

        {conversation.canWrite && (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setLabelsPickerOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground transition-all hover:text-foreground active:scale-95"
            >
              <Tag className="h-4 w-4" />
              <span className="hidden sm:inline">Categoría</span>
            </button>

            {labelsPickerOpen && (
              <>
                <button
                  type="button"
                  aria-label="Cerrar selector de etiquetas"
                  className="fixed inset-0 z-40"
                  onClick={() => setLabelsPickerOpen(false)}
                />
                <div className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-lg border border-border bg-popover shadow-2xl shadow-black/50">
                  {labelsError && (
                    <p className="px-3 py-2.5 text-xs text-primary">{labelsError}</p>
                  )}
                  {labelCatalogLoading ? (
                    <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Cargando…
                    </div>
                  ) : labelCatalog.length === 0 ? (
                    <div className="px-3 py-2.5 text-xs text-muted-foreground">
                      Todavía no hay categorías.
                    </div>
                  ) : (
                    <div className="max-h-56 overflow-y-auto py-1">
                      {labelCatalog.map((l) => {
                        const active = conversation.labels.includes(l.title)
                        return (
                          <button
                            key={l.id}
                            type="button"
                            disabled={labelsSaving}
                            onClick={() => handleToggleLabel(l.title)}
                            className={cn(
                              'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-secondary disabled:opacity-60',
                              active ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground',
                            )}
                          >
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: l.color }}
                            />
                            <span className="flex-1 truncate">{l.title}</span>
                            {active && <span className="text-primary">✓</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {user?.role === 'admin' && (
                    <button
                      type="button"
                      onClick={() => {
                        setLabelsPickerOpen(false)
                        setLabelsManagerOpen(true)
                      }}
                      className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                      Administrar categorías
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {conversation.canWrite && (
          <button
            type="button"
            onClick={() => setCloseSaleOpen(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground transition-all hover:text-foreground active:scale-95"
          >
            <Handshake className="h-4 w-4" />
            <span className="hidden sm:inline">Cerrar venta</span>
          </button>
        )}

        {/* Tomar un chat libre o soltar el propio siempre está disponible;
            soltar el de un compañero no — eso evitaría confundir "no puedo
            tocar este chat" con un botón que sugiere que sí se puede. */}
        {(conversation.canWrite || conversation.assigneeId === null) && (
          <button
            type="button"
            onClick={handleToggleIntervene}
            disabled={interveneLoading}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all active:scale-95 disabled:opacity-60',
              intervened
                ? 'border border-warning/50 bg-warning/15 text-warning'
                : 'power-glow bg-primary text-primary-foreground',
            )}
          >
            {interveneLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Hand className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">
              {intervened ? 'IA en pausa' : 'Intervenir'}
            </span>
          </button>
        )}

        {user?.role === 'admin' && (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={handleOpenAssign}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground transition-all hover:text-foreground active:scale-95"
            >
              <UserCog className="h-4 w-4" />
              <span className="hidden sm:inline">Asignar</span>
            </button>

            {assignOpen && (
              <>
                <button
                  type="button"
                  aria-label="Cerrar selector de asesor"
                  className="fixed inset-0 z-40"
                  onClick={() => setAssignOpen(false)}
                />
                <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-lg border border-border bg-popover shadow-2xl shadow-black/50">
                  {assignError && (
                    <p className="px-3 py-2.5 text-xs text-primary">{assignError}</p>
                  )}
                  {conversation.assigneeId !== null && (
                    <button
                      type="button"
                      disabled={assignLoading}
                      onClick={() => handleAssign(null)}
                      className="block w-full px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60"
                    >
                      Quitar asignación
                    </button>
                  )}
                  {agents === null ? (
                    <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Cargando…
                    </div>
                  ) : agents.length === 0 ? (
                    <div className="px-3 py-2.5 text-xs text-muted-foreground">
                      No hay asesores vinculados a Chatwoot.
                    </div>
                  ) : (
                    agents.map((a) => (
                      <button
                        key={a.email}
                        type="button"
                        disabled={assignLoading || a.chatwootAgentId === conversation.assigneeId}
                        onClick={() => handleAssign(a.chatwootAgentId)}
                        className={cn(
                          'block w-full truncate px-3 py-2.5 text-left text-sm transition-colors hover:bg-secondary disabled:cursor-default',
                          a.chatwootAgentId === conversation.assigneeId
                            ? 'font-semibold text-foreground'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {a.email}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {interveneError && (
        <div className="animate-blur-in flex items-center gap-2 border-b border-primary/30 bg-primary/10 px-4 py-2 text-xs text-primary">
          <Hand className="h-3.5 w-3.5" />
          {interveneError}
        </div>
      )}

      {intervened && (
        <div className="animate-blur-in flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-xs text-warning">
          <Hand className="h-3.5 w-3.5" />
          IA en pausa — tú tienes el control de esta conversación.
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-5 sm:px-6"
      >
        {loadingOlderMessages && (
          <div className="flex justify-center py-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="text-center">
              <Bot className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-2 text-sm text-muted-foreground">
                No hay mensajes en esta conversación
              </p>
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              onReply={handleReply}
              replyPreview={m.inReplyTo ? messagesById.get(m.inReplyTo) ?? null : null}
            />
          ))
        )}

        {conversation.typing && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-border bg-secondary px-4 py-3">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border bg-card/50 px-4 py-3 sm:px-6">
        {conversation.canWrite ? (
          <div className="flex flex-col gap-1.5">
            {!intervened && (
              <p className="flex items-center gap-1.5 text-[0.65rem] text-muted-foreground">
                <Bot className="h-3 w-3 text-success" />
                La IA sigue respondiendo automáticamente — escribes como supervisor, esto no la pausa.
              </p>
            )}
            {imageError && (
              <p role="alert" className="text-xs text-primary">
                {imageError}
              </p>
            )}
            {withinWhatsappWindow ? (
              <p className="flex items-center gap-1.5 text-[0.65rem] text-muted-foreground">
                <Clock className="h-3 w-3 text-success" />
                Ventana de WhatsApp abierta — quedan {formatRemaining(windowExpiresAt! - Date.now())} para responder libremente.
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-[0.65rem] text-warning">
                <Clock className="h-3 w-3" />
                {lastCustomerMessage
                  ? 'Ventana de 24h de WhatsApp cerrada — el cliente no escribe hace más de 24h. Solo se puede reabrir con un mensaje de plantilla ("Nuevo chat").'
                  : 'Todavía no hay respuesta del cliente en esta conversación — no se puede mandar mensaje libre hasta que escriba, o hazlo con una plantilla.'}
              </p>
            )}
            {replyTarget && (
              <div className="flex items-center gap-2 rounded-lg border-l-2 border-primary bg-secondary/60 py-1.5 pl-3 pr-2">
                <Reply className="h-3.5 w-3.5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-primary">
                    Respondiendo a {conversation.contactName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {replyTarget.content || (replyTarget.attachments.length > 0 ? '📎 Adjunto' : '')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTarget(null)}
                  className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  aria-label="Cancelar respuesta"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <form onSubmit={handleSubmit} className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={handlePickImage}
                disabled={imageUploading || !withinWhatsappWindow}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                aria-label="Adjuntar imagen"
              >
                {imageUploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Paperclip className="h-5 w-5" />
                )}
              </button>

              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setQuickRepliesOpen((v) => !v)}
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-lg transition-colors',
                    quickRepliesOpen
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  aria-label="Respuestas rápidas"
                >
                  <MessageSquareText className="h-5 w-5" />
                </button>

                {quickRepliesOpen && (
                  <>
                    <button
                      type="button"
                      aria-label="Cerrar respuestas rápidas"
                      className="fixed inset-0 z-40"
                      onClick={() => setQuickRepliesOpen(false)}
                    />
                    <div className="absolute bottom-full left-0 z-50 mb-2 w-64 overflow-hidden rounded-lg border border-border bg-popover shadow-2xl shadow-black/50">
                      {quickRepliesLoading ? (
                        <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Cargando…
                        </div>
                      ) : quickReplies.length === 0 ? (
                        <div className="px-3 py-2.5 text-xs text-muted-foreground">
                          Todavía no hay respuestas rápidas.
                        </div>
                      ) : (
                        quickReplies.map((qr) => (
                          <button
                            key={qr.id}
                            type="button"
                            onClick={() => insertQuickReply(qr.content)}
                            className="block w-full px-3 py-2.5 text-left transition-colors hover:bg-secondary"
                          >
                            <span className="block text-sm font-medium text-foreground">{qr.label}</span>
                            <span className="block truncate text-xs text-muted-foreground">{qr.content}</span>
                          </button>
                        ))
                      )}
                      {user?.role === 'admin' && (
                        <button
                          type="button"
                          onClick={() => {
                            setQuickRepliesOpen(false)
                            setQuickRepliesManagerOpen(true)
                          }}
                          className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                          Administrar respuestas rápidas
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>

              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleComposerKeyDown}
                onPaste={handleComposerPaste}
                disabled={!withinWhatsappWindow}
                placeholder={
                  withinWhatsappWindow
                    ? 'Escribe como asesor… (Ctrl+J o Shift+Enter para salto de línea)'
                    : 'Ventana de 24h cerrada — usa una plantilla para reabrir el chat'
                }
                aria-label="Mensaje"
                rows={1}
                className="h-11 max-h-32 min-h-11 flex-1 resize-none rounded-lg border border-input bg-background px-4 py-2.5 text-sm leading-snug text-foreground placeholder:text-muted-foreground outline-none transition-shadow focus:border-primary/60 focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!draft.trim() || !withinWhatsappWindow}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-transform active:scale-95 disabled:opacity-40"
                aria-label="Enviar mensaje"
              >
                <SendHorizonal className="h-5 w-5" />
              </button>
            </form>
          </div>
        ) : conversation.assigneeId == null ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background/50 px-4 py-3 text-xs text-muted-foreground">
            <Bot className="h-4 w-4 text-success" />
            La IA está respondiendo automáticamente. Pulsa{' '}
            <span className="font-semibold text-foreground">Intervenir</span>{' '}
            para tomar el control.
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-warning/40 bg-warning/5 px-4 py-3 text-xs text-muted-foreground">
            <Hand className="h-4 w-4 text-warning" />
            Intervenida por{' '}
            <span className="font-semibold text-foreground">
              {conversation.assigneeName ?? 'otro asesor'}
            </span>{' '}
            — solo puede escribir quien la tiene asignada.
          </div>
        )}
      </div>

      <CloseSaleModal
        key={conversation.id}
        open={closeSaleOpen}
        conversation={conversation}
        messages={messages}
        onClose={() => setCloseSaleOpen(false)}
        onSubmit={onCloseSale}
      />

      <QuickRepliesManagerModal
        open={quickRepliesManagerOpen}
        replies={quickReplies}
        loading={quickRepliesLoading}
        onClose={() => setQuickRepliesManagerOpen(false)}
        onCreate={createQuickReply}
        onUpdate={updateQuickReply}
        onDelete={removeQuickReply}
      />

      <LabelsManagerModal
        open={labelsManagerOpen}
        labels={labelCatalog}
        loading={labelCatalogLoading}
        onClose={() => setLabelsManagerOpen(false)}
        onCreate={onCreateLabel}
      />
    </section>
  )
}
