"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  closeConversation,
  fetchConversations,
  fetchMessages,
  markConversationRead,
  sendImageMessage,
  sendMessage,
  toggleIntervention,
} from "@/lib/api/chatwoot"
import { addOrder } from "@/lib/api/orders"
import type { ChatwootConversation, ChatwootMessage, NewMessageInput } from "@/lib/types/chatwoot"
import type { DataSource } from "@/lib/api/shared"
import type { NewOrderDb } from "@/lib/types/order"

// `active` es falso cuando la pestaña de WhatsApp sigue montada (para
// cambiar de pestaña sin perder el estado ni recargar) pero no es la que
// se está viendo — en ese caso se pausa el polling en segundo plano y se
// refresca una vez al volver, en lugar de seguir pegándole a Chatwoot cada
// pocos segundos sin que nadie esté mirando.
export function useChatwoot(active: boolean = true) {
  const [conversations, setConversations] = useState<ChatwootConversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatwootMessage[]>([])
  const [source, setSource] = useState<DataSource>("demo")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wasActive = useRef(active)

  const initialId = useRef<string | null>(null)

  const loadConversations = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true)
    setError(null)
    try {
      const data = await fetchConversations()
      setConversations(data.conversations)
      setSource(data.source)
      if (!initialId.current && data.conversations.length > 0) {
        initialId.current = data.conversations[0].id
        setActiveId(data.conversations[0].id)
      }
    } catch {
      if (!options?.silent) setError("No se pudieron cargar las conversaciones.")
    } finally {
      if (!options?.silent) setLoading(false)
    }
  }, [])

  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      const data = await fetchMessages(conversationId)
      setMessages(data.messages)
    } catch {
      setMessages([])
    }
  }, [])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  useEffect(() => {
    if (!active) return
    const interval = setInterval(() => {
      loadConversations({ silent: true })
    }, 6000)
    return () => clearInterval(interval)
  }, [active, loadConversations])

  // Al volver a la pestaña después de haberla dejado en pausa, refresca de
  // una vez en lugar de esperar al próximo tick del polling.
  useEffect(() => {
    if (active && !wasActive.current) {
      loadConversations({ silent: true })
      if (activeId) loadMessages(activeId)
    }
    wasActive.current = active
  }, [active, activeId, loadConversations, loadMessages])

  useEffect(() => {
    if (activeId) {
      loadMessages(activeId)
    }
  }, [activeId, loadMessages])

  useEffect(() => {
    if (!activeId) return
    // Marca la conversación como leída de verdad en Chatwoot (no solo en
    // el estado local) — así el conteo real de no leídos queda en 0 para
    // siempre, sin importar si se sale y se vuelve a entrar a la pestaña,
    // se recarga la página, o pasa el tiempo entre pollings.
    setConversations((prev) =>
      prev.map((c) => (c.id === activeId ? { ...c, unreadCount: 0 } : c)),
    )
    markConversationRead(activeId).catch(() => {})
  }, [activeId])

  useEffect(() => {
    if (!activeId || !active) return

    pollingRef.current = setInterval(() => {
      loadMessages(activeId)
    }, 5000)

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [activeId, active, loadMessages])

  const selectConversation = useCallback((id: string) => {
    setActiveId((prev) => {
      if (prev === id) return prev
      setMessages([])
      return id
    })
  }, [])

  const send = useCallback(
    async (input: NewMessageInput) => {
      if (!activeId) return
      const msg = await sendMessage(activeId, input)
      setMessages((prev) => [...prev, msg])
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId
            ? { ...c, lastMessage: input.content, handledBy: "human" }
            : c,
        ),
      )
    },
    [activeId],
  )

  const sendImage = useCallback(
    async (file: File, caption?: string) => {
      if (!activeId) return
      const msg = await sendImageMessage(activeId, file, caption)
      setMessages((prev) => [...prev, msg])
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId ? { ...c, lastMessage: msg.content || '📷 Imagen', handledBy: "human" } : c,
        ),
      )
    },
    [activeId],
  )

  const toggle = useCallback(async (): Promise<{ error: string } | { ok: true }> => {
    if (!activeId) return { error: "No hay conversación seleccionada." }
    const wasHuman = conversations.find((c) => c.id === activeId)?.handledBy === "human"
    const newState = !wasHuman
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeId ? { ...c, handledBy: newState ? "human" : "ai" } : c,
      ),
    )
    try {
      await toggleIntervention(activeId, newState)
      return { ok: true }
    } catch (err) {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId ? { ...c, handledBy: wasHuman ? "human" : "ai" } : c,
        ),
      )
      return { error: err instanceof Error ? err.message : "No se pudo cambiar el estado." }
    }
  }, [activeId, conversations])

  const closeSale = useCallback(
    async (input: NewOrderDb): Promise<{ error: string } | { ok: true }> => {
      const result = await addOrder(input)
      if ("error" in result) return result

      try {
        await closeConversation(input.conversationId)
      } catch {
        return { error: "error_chatwoot" }
      }

      setConversations((prev) =>
        prev.map((c) =>
          c.id === input.conversationId ? { ...c, status: "resolved", handledBy: "ai" } : c,
        ),
      )
      return { ok: true }
    },
    [],
  )

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null

  return {
    conversations,
    activeId,
    activeConversation,
    messages,
    source,
    loading,
    error,
    // Se deriva del assignee real de Chatwoot (handledBy), no de un flag
    // local — así, si la conversación se asigna desde n8n o desde el
    // propio Chatwoot, el front lo refleja en el próximo polling sin
    // necesidad de haber pasado por el botón "Intervenir".
    intervened: activeConversation?.handledBy === "human",
    selectConversation,
    send,
    sendImage,
    toggle,
    closeSale,
    reload: loadConversations,
  }
}
