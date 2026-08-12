"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  assignConversation,
  closeConversation,
  fetchConversations,
  fetchMessages,
  markConversationRead,
  markConversationUnread,
  sendImageMessage,
  sendMessage,
  setConversationLabels,
  startNewConversation,
  toggleIntervention,
  type StartConversationInput,
} from "@/lib/api/chatwoot"
import { addOrder } from "@/lib/api/orders"
import type { ChatwootConversation, ChatwootMessage, NewMessageInput } from "@/lib/types/chatwoot"
import type { DataSource } from "@/lib/api/shared"
import type { NewOrderDb } from "@/lib/types/order"
import { useAuth } from "@/lib/hooks/use-auth"

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

// El nombre real del agente de Chatwoot (ej. "Jose Riera") no está
// disponible acá sin un fetch extra (fetchAgents es admin-only y ni así
// resuelve el de uno mismo si no es admin) — se deriva uno legible del
// correo de sesión ("jose.riera@sbkmotors.com" -> "Jose Riera") para las
// notas de sistema de `toggle()` más abajo, en vez de mostrar el correo
// crudo o quedarse sin nombre.
function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] || email
  return (
    local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || email
  )
}

export function useChatwoot(active: boolean = true) {
  // Solo para poder calcular el mismo `canWrite` que ya deriva el servidor
  // (ver app/api/chatwoot/conversations/route.ts) en el optimistic update
  // de `toggle` — así el compositor se habilita al toque, sin esperar la
  // vuelta completa por la red.
  const { user } = useAuth()
  const [conversations, setConversations] = useState<ChatwootConversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatwootMessage[]>([])
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false)
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
      // Chatwoot no manda un total ni un "hay más" explícito — si la
      // primera tanda viene vacía, no hay nada que paginar; si trae algo,
      // se asume que puede haber más atrás hasta que un `before` devuelva
      // una tanda vacía (ver loadOlderMessages).
      setHasMoreMessages(data.messages.length > 0)
    } catch {
      if (requestId !== messagesRequestId.current) return
      setMessages([])
      setHasMoreMessages(false)
    }
  }, [])

  // Pide la tanda de mensajes anterior a la más vieja que ya se tiene
  // cargada y la antepone — así se puede seguir subiendo en el historial en
  // vez de quedarse solo con los últimos mensajes que trae Chatwoot por
  // defecto. Reusa el mismo contador de secuencia que loadMessages: si una
  // recarga completa (p. ej. por un evento de SSE) arranca mientras esto
  // sigue en vuelo, el resultado de esta tanda vieja se descarta en vez de
  // pisar el historial ya reemplazado.
  const loadOlderMessages = useCallback(async () => {
    if (!activeId || messages.length === 0) return
    const requestId = ++messagesRequestId.current
    setLoadingOlderMessages(true)
    try {
      const oldestId = messages[0].id
      const data = await fetchMessages(activeId, oldestId)
      if (requestId !== messagesRequestId.current) return
      if (data.messages.length === 0) {
        setHasMoreMessages(false)
      } else {
        setMessages((prev) => [...data.messages, ...prev])
      }
    } catch {
      // se deja hasMoreMessages como estaba — el usuario puede reintentar
      // volviendo a scrollear arriba.
    } finally {
      if (requestId === messagesRequestId.current) setLoadingOlderMessages(false)
    }
  }, [activeId, messages])

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

  // Conexión en tiempo real: un evento del webhook de Chatwoot llega aquí en
  // milisegundos. "conversation_changed" cubre creada/actualizada/cambio de
  // estado — bastante menos frecuente que un mensaje, pero Chatwoot puede
  // mandar varios seguidos de golpe (p. ej. procesando una tanda de cambios).
  // Ver la nota de incidente en lib/api/chatwoot-sync.ts para el contexto
  // completo (A/B/C/D) de por qué esto quedó así.
  //
  // "message_changed" en cambio dispara UNA VEZ POR MENSAJE de WhatsApp
  // entrante. Recargar el listado completo (que en producción pagina varias
  // veces contra Chatwoot) por cada mensaje fue justo lo que saturó Chatwoot
  // — con suficientes asesores y mensajes seguidos, los barridos completos
  // se acumulaban más rápido de lo que Chatwoot podía responderlos. Ya no
  // disparan una recarga completa: si el mensaje es de la conversación
  // abierta, se refrescan sus mensajes (como antes); si es de otra, se
  // actualiza su fila EN MEMORIA (sin pegarle a la red) con lo único que ya
  // sabemos del evento — el texto del último mensaje queda desactualizado
  // hasta el próximo conversation_changed o el polling de respaldo, a
  // propósito, en vez de justificar otro barrido completo.
  useEffect(() => {
    if (!active) return

    const source = new EventSource("/api/chatwoot/events")

    // Coalescer para "conversation_changed": si llegan varios eventos
    // seguidos, se agrupan en UNA sola recarga en vez de una por evento. A
    // propósito dispara siempre a los ~800ms del PRIMER evento de la ventana
    // (no se reinicia con cada evento nuevo) — así una ráfaga continua nunca
    // puede posponer la recarga indefinidamente, solo acota cuántas veces se
    // dispara. `let` local al efecto (no un ref del hook): este efecto ya se
    // recrea entero cuando cambia `activeId`, así que el timer vive y muere
    // con la misma instancia de EventSource a la que pertenece.
    let coalesceTimer: ReturnType<typeof setTimeout> | null = null
    function scheduleConversationsReload() {
      if (coalesceTimer) return
      coalesceTimer = setTimeout(() => {
        coalesceTimer = null
        loadConversations({ silent: true })
      }, 800)
    }

    source.onmessage = (ev) => {
      let data: { type?: string; conversationId?: string | null }
      try {
        data = JSON.parse(ev.data)
      } catch {
        return
      }

      if (data.type === "conversation_changed") {
        scheduleConversationsReload()
        return
      }

      if (data.type === "message_changed" && data.conversationId) {
        if (data.conversationId === activeId) {
          loadMessages(activeId)
          return
        }
        const id = data.conversationId
        setConversations((prev) =>
          prev.map((c) =>
            c.id === id
              ? { ...c, unreadCount: c.unreadCount + 1, lastMessageAt: new Date().toISOString() }
              : c,
          ),
        )
      }
    }

    // EventSource reconecta solo ante errores de red; no hace falta
    // lógica de reintento a mano. Mientras se reconecta, FALLBACK_POLL_MS
    // sigue cubriendo el listado.
    return () => {
      source.close()
      if (coalesceTimer) clearTimeout(coalesceTimer)
    }
  }, [active, activeId, loadConversations, loadMessages])

  const selectConversation = useCallback((id: string) => {
    setActiveId((prev) => {
      if (prev === id) return prev
      setMessages([])
      setHasMoreMessages(false)
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
    async (file: File, caption?: string, inReplyTo?: string) => {
      if (!activeId) return
      const msg = await sendImageMessage(activeId, file, caption, inReplyTo)
      setMessages((prev) => [...prev, msg])
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeId ? { ...c, lastMessage: msg.content || '📷 Imagen', handledBy: "human" } : c,
        ),
      )
    },
    [activeId],
  )

  // Contraparte a mano del efecto de arriba que marca leído automático al
  // seleccionar — sirve para devolver un chat al tab "Sin contestar" sin
  // esperar un mensaje nuevo de verdad. Optimista como el resto de las
  // acciones de este hook: si falla, un `loadConversations` normal en el
  // próximo evento/polling corrige el número real.
  const markUnread = useCallback(
    async (id: string): Promise<{ error: string } | { ok: true }> => {
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, unreadCount: Math.max(c.unreadCount, 1) } : c)),
      )
      try {
        await markConversationUnread(id)
        return { ok: true }
      } catch (err) {
        await loadConversations({ silent: true })
        return {
          error: err instanceof Error ? err.message : "No se pudo marcar como no leída.",
        }
      }
    },
    [loadConversations],
  )

  // Antes este optimistic update solo tocaba `handledBy` (el badge de
  // arriba) — `assigneeId`/`canWrite` se quedaban con el valor viejo hasta
  // que llegara una recarga real (SSE + caché de 15s del backend, ver
  // invalidateConversationsCache en lib/api/chatwoot-sync.ts). Resultado:
  // el badge decía "IA en pausa" pero el compositor de texto seguía sin
  // aparecer, como si Intervenir no hubiera hecho efecto. Ahora se calcula
  // acá el mismo `canWrite` que ya deriva el servidor (mismo agente propio
  // que /intervene le asigna a la conversación cuando SÍ hay uno
  // vinculado), para que badge y compositor cambien juntos al toque.
  //
  // `assigneeName` NO se toca a propósito: solo se muestra en el banner
  // "Intervenida por X" cuando `canWrite` es `false` (es decir, cuando la
  // tiene OTRO asesor) — quien hace clic acá nunca ve ese banner para su
  // propia intervención (ve el compositor), así que no hay nada que
  // adivinar ahí sin arriesgarse a mostrar un nombre incorrecto.
  const toggle = useCallback(async (): Promise<{ error: string } | { ok: true }> => {
    if (!activeId) return { error: "No hay conversación seleccionada." }
    const current = conversations.find((c) => c.id === activeId)
    const wasHuman = current?.handledBy === "human"
    const newState = !wasHuman

    const prevSnapshot = current
      ? { assigneeId: current.assigneeId, canWrite: current.canWrite, handledBy: current.handledBy }
      : null

    const isAdmin = user?.role === "admin"
    const myAgentId = user?.chatwootAgentId ?? null
    // Al soltar (newState false) siempre queda sin asignar. Al tomar
    // (newState true), Chatwoot asigna al agente propio de quien
    // interviene si está vinculado — si no, el servidor cae al agente del
    // token compartido (un id que no podemos adivinar acá), así que se
    // deja el assigneeId anterior para ese caso poco común y se confía en
    // la próxima recarga real para corregirlo.
    const optimisticAssigneeId = newState ? (myAgentId ?? current?.assigneeId ?? null) : null
    const optimisticCanWrite = isAdmin || (myAgentId !== null && optimisticAssigneeId === myAgentId)

    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeId
          ? {
              ...c,
              handledBy: newState ? "human" : "ai",
              assigneeId: optimisticAssigneeId,
              canWrite: optimisticCanWrite,
            }
          : c,
      ),
    )

    // Aviso en el propio historial del chat de quién tomó/soltó el control
    // — Chatwoot genera uno nativo para esto, pero siempre atribuido al
    // dueño del token compartido (nunca a quien de verdad hizo clic acá),
    // así que se oculta en la ruta GET de mensajes (ver ese comentario) y
    // se reemplaza por este, 100% local: no se manda a Chatwoot como
    // mensaje real porque el listado de conversaciones toma el ÚLTIMO
    // mensaje de la conversación como vista previa — mandar esto ahí
    // pisaría el último mensaje real del cliente en la lista. Efecto
    // secundario aceptado: solo lo ve quien hizo la acción, en esta sesión,
    // y desaparece si se recarga el historial completo desde Chatwoot.
    const wasMine = current?.assigneeId != null && myAgentId !== null && current.assigneeId === myAgentId
    const actorName = user?.email ? displayNameFromEmail(user.email) : "Alguien"
    const releasedName = current?.assigneeName ?? actorName
    const systemMessageId = `system-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      {
        id: systemMessageId,
        content: newState
          ? `"${actorName}" auto-asignado a esta conversación`
          : `"${releasedName}" fue desasignado por ${wasMine ? "Sistema" : actorName}`,
        messageType: "system",
        senderType: "human",
        senderName: null,
        createdAt: new Date().toISOString(),
        attachments: [],
      },
    ])

    try {
      await toggleIntervention(activeId, newState)
      return { ok: true }
    } catch (err) {
      if (prevSnapshot) {
        setConversations((prev) =>
          prev.map((c) => (c.id === activeId ? { ...c, ...prevSnapshot } : c)),
        )
      }
      setMessages((prev) => prev.filter((m) => m.id !== systemMessageId))
      return { error: err instanceof Error ? err.message : "No se pudo cambiar el estado." }
    }
  }, [activeId, conversations, user])

  // Asignación directa por un supervisor — a diferencia de `toggle`, no
  // asigna al propio agente de quien llama sino al que se elija (o
  // desasigna con `null`). El servidor recalcula `canWrite` en el próximo
  // `loadConversations`, así que no hace falta tocarlo a mano acá.
  const assign = useCallback(
    async (agentId: number | null): Promise<{ error: string } | { ok: true }> => {
      if (!activeId) return { error: "No hay conversación seleccionada." }
      try {
        await assignConversation(activeId, agentId)
        await loadConversations({ silent: true })
        return { ok: true }
      } catch (err) {
        return {
          error: err instanceof Error ? err.message : "No se pudo asignar la conversación.",
        }
      }
    },
    [activeId, loadConversations],
  )

  // Reemplaza el set de etiquetas de la conversación activa — igual que
  // `assign`, actualiza el estado local al toque (optimista) y confirma
  // contra el servidor; si falla, un `loadConversations` normal en el
  // próximo evento/polling corrige cualquier desfase.
  const setLabels = useCallback(
    async (labels: string[]): Promise<{ error: string } | { ok: true }> => {
      if (!activeId) return { error: "No hay conversación seleccionada." }
      const id = activeId
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, labels } : c)))
      try {
        await setConversationLabels(id, labels)
        return { ok: true }
      } catch (err) {
        await loadConversations({ silent: true })
        return {
          error: err instanceof Error ? err.message : "No se pudieron guardar las etiquetas.",
        }
      }
    },
    [activeId, loadConversations],
  )

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
    hasMoreMessages,
    loadingOlderMessages,
    loadOlderMessages,
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
    markUnread,
    toggle,
    assign,
    setLabels,
    closeSale,
    startConversation,
    reload: loadConversations,
  }
}
