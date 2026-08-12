// ============================================================================
// Notas de sistema del chat (tomar/soltar intervención) — persistidas aparte
// de Chatwoot. Ver db/chat_system_events_schema.sql.
// ============================================================================
// Chatwoot genera su propio aviso de asignación, pero siempre lo atribuye al
// dueño del token compartido de la API (nunca a quien de verdad hizo clic en
// el panel) — por eso ese aviso nativo se oculta del historial (ver el GET
// de app/api/chatwoot/conversations/[id]/messages/route.ts) y se reemplaza
// por uno propio, con el nombre real.
//
// No se guarda como mensaje real de Chatwoot a propósito: tanto el listado
// de conversaciones (API) como la lectura directa a Postgres toman el
// ÚLTIMO mensaje de la conversación como vista previa — mandar esto como
// mensaje real pisaría ahí el último mensaje de verdad del cliente. Guardarlo
// en una tabla propia lo deja fuera de ese camino por completo, a la vez que
// sí sobrevive recargas de página y llega a cualquiera que abra el mismo
// chat (a diferencia de la versión 100% local que se muestra al toque desde
// use-chatwoot.ts mientras esta escritura todavía está en camino).
// ============================================================================

import { getSupabase } from "@/lib/supabase/client"

export interface ChatSystemEvent {
  content: string
  createdAt: string
}

const globalForStore = globalThis as unknown as {
  __chatSystemEventsStore?: Map<string, ChatSystemEvent[]>
}

function getMemoryStore(): Map<string, ChatSystemEvent[]> {
  if (!globalForStore.__chatSystemEventsStore) {
    globalForStore.__chatSystemEventsStore = new Map()
  }
  return globalForStore.__chatSystemEventsStore
}

// No debe tumbar la acción de intervenir/soltar si falla — ya se aplicó de
// verdad en Chatwoot en ese punto, esto es solo la bitácora. Por eso no
// propaga el error, solo lo deja en consola para poder notarlo.
export async function recordSystemEvent(conversationId: string, content: string): Promise<void> {
  const supabase = getSupabase()
  const createdAt = new Date().toISOString()

  if (supabase) {
    const { error } = await supabase
      .from("chat_system_events")
      .insert({ conversation_id: conversationId, content })
    if (error) console.error("chat-system-events: no se pudo guardar", error)
    return
  }

  const store = getMemoryStore()
  const list = store.get(conversationId) ?? []
  list.push({ content, createdAt })
  store.set(conversationId, list)
}

export async function listSystemEvents(conversationId: string): Promise<ChatSystemEvent[]> {
  const supabase = getSupabase()

  if (supabase) {
    const { data, error } = await supabase
      .from("chat_system_events")
      .select("content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
    if (error) {
      console.error("chat-system-events: no se pudo leer", error)
      return []
    }
    return (data ?? []).map((row) => ({ content: String(row.content), createdAt: String(row.created_at) }))
  }

  return getMemoryStore().get(conversationId) ?? []
}
