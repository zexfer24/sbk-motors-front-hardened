// ============================================================================
// Notas privadas por cliente — persistidas aparte de Chatwoot, por
// contact_id (no por conversation_id: un mismo cliente puede tener varias
// conversaciones). Ver db/chat_notes_schema.sql.
// ============================================================================
// Editar/borrar: solo el propio autor de la nota puede hacerlo (pedido
// explícito del negocio) — por eso updateNote/deleteNote filtran también
// por author_email, no solo por id, así la comprobación de dueño vive en la
// misma consulta y no hace falta un fetch previo para validarla.
// ============================================================================

import { getSupabase } from "@/lib/supabase/client"

export interface ChatNote {
  id: string
  authorEmail: string
  content: string
  createdAt: string
  updatedAt: string | null
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
      .select("id, author_email, content, created_at, updated_at")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: true })
    if (error) {
      console.error("chat-notes: no se pudo leer", error)
      return []
    }
    return (data ?? []).map(fromRow)
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
      .select("id, author_email, content, created_at, updated_at")
      .single()
    if (error) {
      console.error("chat-notes: no se pudo guardar", error)
      return { error: "error_supabase" }
    }
    return fromRow(data)
  }

  const note: ChatNote = {
    id: crypto.randomUUID(),
    authorEmail,
    content,
    createdAt: new Date().toISOString(),
    updatedAt: null,
  }
  const store = getMemoryStore()
  const list = store.get(contactId) ?? []
  list.push(note)
  store.set(contactId, list)
  return note
}

export async function updateNote(
  id: string,
  authorEmail: string,
  content: string,
): Promise<ChatNote | { error: string }> {
  const supabase = getSupabase()

  if (supabase) {
    const { data, error } = await supabase
      .from("chat_notes")
      .update({ content, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("author_email", authorEmail)
      .select("id, author_email, content, created_at, updated_at")
      .maybeSingle()
    if (error) {
      console.error("chat-notes: no se pudo editar", error)
      return { error: "error_supabase" }
    }
    if (!data) return { error: "no_encontrada" }
    return fromRow(data)
  }

  for (const list of getMemoryStore().values()) {
    const note = list.find((n) => n.id === id && n.authorEmail === authorEmail)
    if (note) {
      note.content = content
      note.updatedAt = new Date().toISOString()
      return note
    }
  }
  return { error: "no_encontrada" }
}

export async function deleteNote(id: string, authorEmail: string): Promise<{ ok: true } | { error: string }> {
  const supabase = getSupabase()

  if (supabase) {
    const { data, error } = await supabase
      .from("chat_notes")
      .delete()
      .eq("id", id)
      .eq("author_email", authorEmail)
      .select("id")
      .maybeSingle()
    if (error) {
      console.error("chat-notes: no se pudo borrar", error)
      return { error: "error_supabase" }
    }
    if (!data) return { error: "no_encontrada" }
    return { ok: true }
  }

  for (const [contactId, list] of getMemoryStore()) {
    const idx = list.findIndex((n) => n.id === id && n.authorEmail === authorEmail)
    if (idx !== -1) {
      list.splice(idx, 1)
      getMemoryStore().set(contactId, list)
      return { ok: true }
    }
  }
  return { error: "no_encontrada" }
}

function fromRow(row: Record<string, unknown>): ChatNote {
  return {
    id: String(row.id),
    authorEmail: String(row.author_email),
    content: String(row.content),
    createdAt: String(row.created_at),
    updatedAt: row.updated_at != null ? String(row.updated_at) : null,
  }
}
