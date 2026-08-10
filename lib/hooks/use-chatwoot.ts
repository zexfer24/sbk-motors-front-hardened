"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  closeConversation,
  fetchConversations,
  fetchMessages,
  markConversationRead,
  sendImageMessage,
  sendMessage,
  startNewConversation,
  toggleIntervention,
  type StartConversationInput,
} from "@/lib/api/chatwoot"
import { addOrder } from "@/lib/api/orders"
import type { ChatwootConversation, ChatwootMessage, NewMessageInput } from "@/lib/types/chatwoot"
import type { DataSource } from "@/lib/api/shared"
import type { NewOrderDb } from "@/lib/types/order"

// `active` es falso cuando la pestaña de WhatsApp sigue montada (para
// cambiar de pestaña sin perder el estado ni recargar) pero no es la que
// se está viendo — en ese caso se cierra la conexión en tiempo real y se
// refresca una vez al volver, en lugar de mantenerla abierta sin que nadie
// esté mirando.
//
// El aviso de "algo cambió" llega por SSE (/api/chatwoot/events), que a su
// vez lo recibe del webhook de Chatwoot casi al instante — ya no hace falta
// preguntar cada 5-6s "¿hay algo nuevo?". El polling que queda abajo
// (FALLBACK_POLL_MS) es solo una red de seguridad, muy poco frecuente, por
// si el webhook no está configurado en esta instancia de Chatwoot o la
// conexión SSE se cae y tarda en reconectar.
const FALLBACK_POLL_MS = 45_000

export function useChatwoot(active: boolean = true) {
  const [conversations, setConversations] = useState<ChatwootConversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatwootMessage[]>([])
  const [source, setSource] = useState<DataSource>("demo")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const wasActive = useRef(active)

  const initialId = useRef<string | null>(null)

  // Con el SSE, varios eventos seguidos (p. ej. tres mensajes llegando en
  // el mismo segundo) pueden disparar varios fetch de golpe. Si la red
  // responde en un orden distinto al que salieron, una respuesta VIEJA que
  // llega tarde pisaría a una más nueva que ya se había pintado — se ve
  // como que el chat "vuelve atrás" un instante. Estos contadores marcan
  // cuál fue la última petición disparada; si una respuesta llega y ya no
  // es la más reciente, se descarta en vez de aplicarse.
  const conversationsRequestId = useRef(0)
  const messagesRequestId = useRef(0)

  const loadConversations = useCallback(async (options?: { silent?: boolean }) => {
    const requestId = ++conversationsRequestId.current
    if (!options?.silent) setLoading(true)
    setError(null)
    try {
      const data = await fetchConversations()
      if (requestId !== conversationsRequestId.current) return
      setConversations(data.conversations)
      setSource(data.source)
      if (!initialId.current && data.conversations.length > 0) {
        initialId.current = data.conversations[0].id
        setActiveId(data.conversations[0].id)
      }
    } catch {
      if (requestId !== conversationsRequestId.current) return
      if (!options?.silent) setError("No se pudieron cargar las conversaciones.")
    } finally {
      if (requestId === conversationsRequestId.current && !options?.silent) setLoading(false)
    }
  }, [])

  const loadMessages = useCallback(async (conversationId: string) => {
    const requestId = ++messagesRequestId.current
    try {
      const data = await fetchMessages(conversationId)
      if (requestId !== messagesRequestId.current) return
      setMessages(data.messages)
    } catch {
      if (requestId !== messagesRequestId.current) return
      setMessages([])
    }
  }, [])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  // Red de seguridad, no la vía principal — ver comentario de
  // FALLBACK_POLL_MS arriba. La vía principal es el efecto de SSE, más
  // abajo.
  useEffect(() => {
    if (!active) return
    const interval = setInterval(() => {
      loadConversations({ silent: true })
    }, FALLBACK_POLL_MS)
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

  // Conexión en tiempo real: un evento del webhook de Chatwoot llega aquí
  // en milisegundos. "conversation_changed" siempre refresca el listado
  // (ya viene filtrado por permisos desde el servidor); "message_changed"
  // solo refresca los mensajes si es justo la conversación abierta — si es
  // otra, alcanza con que se actualice su fila en el listado (último
  // mensaje, no leídos).
  useEffect(() => {
    if (!active) return

    const source = new EventSource("/api/chatwoot/events")

    source.onmessage = (ev) => {
      let data: { type?: string; conversationId?: string | null }
      try {
        data = JSON.parse(ev.data)
      } catch {
        return
      }

      if (data.type === "conversation_changed" || data.type === "message_changed") {
        loadConversations({ silent: true })
      }
      if (data.type === "message_changed" && data.conversationId === activeId && activeId) {
        loadMessages(activeId)
      }
    }

    // EventSource reconecta solo ante errores de red; no hace falta
    // lógica de reintento a mano. Mientras se reconecta, FALLBACK_POLL_MS
    // sigue cubriendo el listado.
    return () => source.close()
  }, [active, activeId, loadConversations, loadMessages])

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

  // Inicia un chat con un contacto/número nuevo mandando una plantilla
  // preaprobada (necesario fuera de la ventana de 24h de WhatsApp). Al
  // terminar, recarga el listado (para que la conversación nueva aparezca
  // con sus datos reales de Chatwoot, ya filtrados por permisos en el
  // servidor) y la deja seleccionada.
  const startConversation = useCallback(
    async (input: StartConversationInput): Promise<{ error: string } | { ok: true }> => {
      const result = await startNewConversation(input)
      if ("error" in result) return result
      await loadConversations({ silent: true })
      setActiveId(result.conversationId)
      return { ok: true }
    },
    [loadConversations],
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
    startConversation,
    reload: loadConversations,
  }
}
