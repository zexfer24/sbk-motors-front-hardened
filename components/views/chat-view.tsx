'use client'

import { useMemo, useState } from 'react'
import { Bot } from 'lucide-react'
import { WhatsappIcon } from '@/components/chat/whatsapp-icon'
import { ConversationList } from '@/components/chat/conversation-list'
import { ChatPanel } from '@/components/chat/chat-panel'
import { NewConversationModal } from '@/components/chat/new-conversation-modal'
import { OperationsCenterView } from '@/components/views/operations-center-view'
import { Skeleton } from '@/components/ui/skeleton'
import { useChatwoot } from '@/lib/hooks/use-chatwoot'
import { useLabels } from '@/lib/hooks/use-labels'
import { useExchangeRate } from '@/lib/hooks/use-exchange-rate'
import type { StartConversationInput } from '@/lib/api/chatwoot'
import { cn } from '@/lib/utils'

interface ChatViewProps {
  /** Falso mientras la pestaña de WhatsApp está montada pero no es la que se está viendo — pausa el polling. */
  active: boolean
}

export function ChatView({ active }: ChatViewProps) {
  const {
    conversations,
    activeId,
    activeConversation,
    messages,
    hasMoreMessages,
    loadingOlderMessages,
    loadOlderMessages,
    source,
    loading,
    intervened,
    selectConversation,
    send,
    sendImage,
    deleteMessage,
    markUnread,
    toggle,
    assign,
    assignConversationById,
    setLabels,
    closeSale,
    startConversation,
  } = useChatwoot(active)

  // Catálogo de categorías (labels) — se carga UNA vez acá y se pasa a
  // ConversationList y ChatPanel, en vez de que cada uno llame a
  // useLabels() por su cuenta: dos instancias separadas del hook tendrían
  // cada una su propio estado, así que crear una categoría desde el chat
  // no se reflejaría en el selector de filtros de la lista (y viceversa).
  const {
    labels: labelCatalog,
    loading: labelCatalogLoading,
    create: createLabel,
    update: updateLabel,
    remove: removeLabel,
  } = useLabels()

  const [showConversationOnMobile, setShowConversationOnMobile] = useState(false)
  const [newChatOpen, setNewChatOpen] = useState(false)
  const { rate: bcvRate, loading: bcvLoading, available: bcvAvailable } = useExchangeRate()

  // Cuenta CONVERSACIONES con al menos un mensaje sin leer, no la suma de
  // mensajes sin leer (2026-08-16, pedido explícito del negocio) — mismo
  // criterio que ya usa StatsRow en advisor-control-view.tsx (Centro de
  // Control). Antes sumaba unreadCount de todas, así que el número podía
  // superar la cantidad real de conversaciones. Nota: este badge sigue sin
  // filtrar por status (a diferencia del Centro de Control, que exige
  // status === 'open'), así que puede seguir difiriendo de ese número en
  // chats pendientes/en espera con mensajes sin leer — no se unificó ese
  // criterio acá, queda para una decisión aparte si hace falta.
  const totalUnread = useMemo(
    () => conversations.filter((c) => c.unreadCount > 0).length,
    [conversations],
  )

  function handleSelect(id: string) {
    selectConversation(id)
    setShowConversationOnMobile(true)
  }

  // Clic en un espacio en blanco dentro de WhatsApp (el encabezado, ver
  // más abajo) — deselecciona el chat activo y vuelve a mostrar el Centro
  // de Operaciones (components/views/operations-center-view.tsx) en vez
  // del panel de chat. `true` en showConversationOnMobile a propósito: en
  // mobile así se ve el Centro de Operaciones en la sección derecha en vez
  // de caer de vuelta a la lista.
  function handleDeselect() {
    selectConversation(null)
    setShowConversationOnMobile(true)
  }

  async function handleStartConversation(input: StartConversationInput) {
    const result = await startConversation(input)
    if ('ok' in result) setShowConversationOnMobile(true)
    return result
  }

  if (loading) {
    return (
      <div className="flex h-dvh flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[oklch(0.55_0.14_150)]/20 text-[oklch(0.72_0.17_150)]">
              <WhatsappIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.3em] text-primary">
                WhatsApp Business
              </p>
              <h1 className="heading-stamp text-lg text-foreground sm:text-xl">
                Chats en vivo
              </h1>
            </div>
          </div>
          <Bot className="h-5 w-5 animate-pulse text-muted-foreground" />
        </header>
        <div className="flex min-h-0 flex-1">
          <div className="hidden w-72 shrink-0 flex-col border-r border-border lg:w-80 md:flex">
            <div className="border-b border-border p-3">
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="animate-row-assemble flex items-start gap-3 border-b border-border/60 px-4 py-3"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              </div>
            ))}
          </div>
          <div className="hidden flex-1 items-center justify-center md:flex">
            <div className="flex flex-col items-center gap-3 text-center">
              <Bot className="h-8 w-8 animate-pulse text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Cargando conversaciones…</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col">
      {/* onClick acá arriba, no en un botón aparte: pedido del negocio —
          clic en el espacio en blanco del encabezado (ningún hijo de acá
          tiene su propio onClick, así que el clic siempre burbujea hasta
          este handler) deselecciona el chat activo y vuelve a mostrar el
          Centro de Operaciones. handleDeselect ya no-opea sola si no hay
          nada seleccionado (mismo guard que ya usa selectConversation). */}
      <header
        onClick={handleDeselect}
        title={activeConversation ? 'Volver al Centro de Operaciones' : undefined}
        className={cn(
          'flex items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6',
          activeConversation && 'cursor-pointer',
        )}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[oklch(0.55_0.14_150)]/20 text-[oklch(0.72_0.17_150)]">
            <WhatsappIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.3em] text-primary">
              WhatsApp Business
            </p>
            <h1 className="heading-stamp text-lg text-foreground sm:text-xl">
              Chats en vivo
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs',
              source === 'chatwoot'
                ? 'border-success/30 bg-success/10 text-success'
                : 'border-warning/30 bg-warning/10 text-warning',
            )}
          >
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                source === 'chatwoot' ? 'bg-success' : 'bg-warning',
              )}
            />
            {source === 'chatwoot' ? 'API WhatsApp' : 'Esperando por API'}
          </span>
          <span className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground sm:inline-flex">
            Tasa BCV ·{' '}
            <span className="font-mono font-semibold text-foreground">
              {bcvLoading ? '…' : bcvAvailable && bcvRate !== null ? `Bs ${bcvRate.toFixed(2)}` : 'No disponible'}
            </span>
          </span>
          <span className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground sm:inline-flex">
            <span className="h-2 w-2 rounded-full bg-primary" />
            {conversations.length} conversaciones
            {totalUnread > 0 && (
              <span className="font-semibold text-foreground">
                · {totalUnread} sin leer
              </span>
            )}
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Sin overflow acá: ConversationList ya trae su propio contenedor
            con overflow-y-auto para la lista. Tenerlo también en este
            wrapper generaba una segunda barra de scroll (del alto exacto
            del wrapper, redondeo de píxeles de por medio) que no movía nada
            real — la lista entera vive en el scroll interno. */}
        <div
          className={cn(
            'min-h-0 shrink-0 flex-col border-r border-border overflow-hidden md:w-72 lg:w-80',
            showConversationOnMobile ? 'hidden md:flex' : 'flex',
          )}
        >
          <ConversationList
            conversations={conversations}
            activeId={activeId}
            onSelect={handleSelect}
            onNewChat={() => setNewChatOpen(true)}
            onMarkUnread={markUnread}
            onAssign={assignConversationById}
            labelCatalog={labelCatalog}
            labelCatalogLoading={labelCatalogLoading}
          />
        </div>

        <section
          className={cn(
            'min-h-0 min-w-0 flex-1 flex-col',
            showConversationOnMobile ? 'flex' : 'hidden md:flex',
          )}
        >
          {activeConversation ? (
            <ChatPanel
              conversation={activeConversation}
              messages={messages}
              hasMoreMessages={hasMoreMessages}
              loadingOlderMessages={loadingOlderMessages}
              onLoadOlderMessages={loadOlderMessages}
              intervened={intervened}
              onBack={() => setShowConversationOnMobile(false)}
              onSend={(text, inReplyTo) => send({ content: text, messageType: 'outgoing', inReplyTo })}
              onSendImage={sendImage}
              onDeleteMessage={deleteMessage}
              onToggleIntervene={toggle}
              onAssign={assign}
              onSetLabels={setLabels}
              labelCatalog={labelCatalog}
              labelCatalogLoading={labelCatalogLoading}
              onCreateLabel={createLabel}
              onUpdateLabel={updateLabel}
              onDeleteLabel={removeLabel}
              onCloseSale={closeSale}
            />
          ) : (
            <OperationsCenterView conversations={conversations} onSelectConversation={handleSelect} />
          )}
        </section>
      </div>

      <NewConversationModal
        open={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        onStart={handleStartConversation}
      />
    </div>
  )
}
