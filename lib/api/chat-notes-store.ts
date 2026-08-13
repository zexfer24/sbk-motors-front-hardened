// ============================================================================
// Notas privadas por cliente — persistidas aparte de Chatwoot, por
// contact_id (no por conversation_id: un mismo cliente puede tener varias
// conversaciones). Ver db/chat_notes_schema.sql.
// ============================================================================
// Sin update/delete a propósito — el pedido fue que las notas "nunca se
// reinicien". Es un log de bitácora compartido entre asesores y admins, no
// un documento editable.
// ============================================================================

import { getSupabase } from "@/lib/supabase/client"

export interface ChatNote {
  id: string
  authorEmail: string
  content: string
  createdAt: string
}

const globalForStore = globalThis as unknown as {
  __chatNotesStore?: Map<number, ChatNote[]>
}

function getMemoryStore(): Map<number, ChatNote[]> {
  if (!globalForStore.__chatNotesStore) {
    globalForStore.__chatNotesStore = new Map()
  }
  return globalForStore.__chatNotesStore
}

export async function listNotes(contactId: number): Promise<ChatNote[]> {
  const supabase = getSupabase()

  if (supabase) {
    const { data, error } = await supabase
      .from("chat_notes")
      .select("id, author_email, content, created_at")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: true })
    if (error) {
      console.error("chat-notes: no se pudo leer", error)
      return []
    }
    return (data ?? []).map((row) => ({
      id: String(row.id),
      authorEmail: String(row.author_email),
      content: String(row.content),
      createdAt: String(row.created_at),
    }))
  }

  return getMemoryStore().get(contactId) ?? []
}

export async function addNote(
  contactId: number,
  authorEmail: string,
  content: string,
): Promise<ChatNote | { error: string }> {
  const supabase = getSupabase()

  if (supabase) {
    const { data, error } = await supabase
      .from("chat_notes")
      .insert({ contact_id: contactId, author_email: authorEmail, content })
      .select("id, author_email, content, created_at")
      .single()
    if (error) {
      console.error("chat-notes: no se pudo guardar", error)
      return { error: "error_supabase" }
    }
    return {
      id: String(data.id),
      authorEmail: String(data.author_email),
      content: String(data.content),
      createdAt: String(data.created_at),
    }
  }

  const note: ChatNote = {
    id: crypto.randomUUID(),
    authorEmail,
    content,
    createdAt: new Date().toISOString(),
  }
  const store = getMemoryStore()
  const list = store.get(contactId) ?? []
  list.push(note)
  store.set(contactId, list)
  return note
}
