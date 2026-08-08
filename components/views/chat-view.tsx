'use client'

import { useMemo, useState } from 'react'
import { Bot } from 'lucide-react'
import { WhatsappIcon } from '@/components/chat/whatsapp-icon'
import { ConversationList } from '@/components/chat/conversation-list'
import { ChatPanel } from '@/components/chat/chat-panel'
import { Skeleton } from '@/components/ui/skeleton'
import { useChatwoot } from '@/lib/hooks/use-chatwoot'
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
    source,
    loading,
    intervened,
    selectConversation,
    send,
    sendImage,
    toggle,
    closeSale,
  } = useChatwoot(active)

  const [showConversationOnMobile, setShowConversationOnMobile] = useState(false)

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + c.unreadCount, 0),
    [conversations],
  )

  function handleSelect(id: string) {
    selectConversation(id)
    setShowConversationOnMobile(true)
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
        <div
          className={cn(
            'min-h-0 shrink-0 flex-col border-r border-border overflow-y-auto md:w-72 lg:w-80',
            showConversationOnMobile ? 'hidden md:flex' : 'flex',
          )}
        >
          <ConversationList
            conversations={conversations}
            activeId={activeId}
            onSelect={handleSelect}
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
              intervened={intervened}
              onBack={() => setShowConversationOnMobile(false)}
              onSend={(text) => send({ content: text, messageType: 'outgoing' })}
              onSendImage={sendImage}
              onToggleIntervene={toggle}
              onCloseSale={closeSale}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <WhatsappIcon className="mx-auto h-12 w-12 text-muted-foreground/20" />
                <p className="mt-4 text-sm text-muted-foreground">
                  Selecciona una conversación para ver los mensajes
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
