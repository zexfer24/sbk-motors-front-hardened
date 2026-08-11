'use client'

import { useRef, useState, useEffect, useLayoutEffect } from 'react'
import {
  ArrowLeft,
  Bot,
  Hand,
  Handshake,
  Loader2,
  MessageSquareText,
  Paperclip,
  Phone,
  Settings2,
  SendHorizonal,
} from 'lucide-react'
import type { ChatwootConversation, ChatwootMessage } from '@/lib/types/chatwoot'
import type { NewOrderDb } from '@/lib/types/order'
import { MessageBubble } from '@/components/chat/message-bubble'
import { CloseSaleModal } from '@/components/chat/close-sale-modal'
import { QuickRepliesManagerModal } from '@/components/chat/quick-replies-manager-modal'
import { avatarColor } from '@/lib/avatar-color'
import { useAuth } from '@/lib/hooks/use-auth'
import { useQuickReplies } from '@/lib/hooks/use-quick-replies'
import { cn } from '@/lib/utils'

interface ChatPanelProps {
  conversation: ChatwootConversation
  messages: ChatwootMessage[]
  hasMoreMessages: boolean
  loadingOlderMessages: boolean
  onLoadOlderMessages: () => void
  intervened: boolean
  onBack: () => void
  onSend: (text: string) => void
  onSendImage: (file: File, caption?: string) => Promise<void>
  onToggleIntervene: () => Promise<{ error: string } | { ok: true }>
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
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    onSend(text)
    setDraft('')
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

  function handlePickImage() {
    setImageError(null)
    fileInputRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setImageError(null)
    setImageUploading(true)
    try {
      await onSendImage(file)
    } catch {
      setImageError('No se pudo enviar la imagen. Intenta de nuevo.')
    } finally {
      setImageUploading(false)
    }
  }

  function insertQuickReply(content: string) {
    setDraft(content)
    setQuickRepliesOpen(false)
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
        </div>

        <button
          type="button"
          onClick={() => setCloseSaleOpen(true)}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground transition-all hover:text-foreground active:scale-95"
        >
          <Handshake className="h-4 w-4" />
          <span className="hidden sm:inline">Cerrar venta</span>
        </button>

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
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
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
        {intervened ? (
          <div className="flex flex-col gap-1.5">
            {imageError && (
              <p role="alert" className="text-xs text-primary">
                {imageError}
              </p>
            )}
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
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
                disabled={imageUploading}
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

              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Escribe como asesor…"
                aria-label="Mensaje"
                className="h-11 flex-1 rounded-lg border border-input bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-shadow focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
              />
              <button
                type="submit"
                disabled={!draft.trim()}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-transform active:scale-95 disabled:opacity-40"
                aria-label="Enviar mensaje"
              >
                <SendHorizonal className="h-5 w-5" />
              </button>
            </form>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background/50 px-4 py-3 text-xs text-muted-foreground">
            <Bot className="h-4 w-4 text-success" />
            La IA está respondiendo automáticamente. Pulsa{' '}
            <span className="font-semibold text-foreground">Intervenir</span>{' '}
            para tomar el control.
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
    </section>
  )
}
