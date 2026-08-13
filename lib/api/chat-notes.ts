export interface ChatNoteDto {
  id: string
  authorEmail: string
  content: string
  createdAt: string
  updatedAt: string | null
}

function baseUrl() {
  if (typeof window !== "undefined") return ""
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
}

export async function fetchNotes(contactId: number): Promise<ChatNoteDto[]> {
  const res = await fetch(`${baseUrl()}/api/chat-notes?contactId=${contactId}`, { cache: "no-store" })
  if (!res.ok) throw new Error("No se pudieron cargar las notas")
  const data = await res.json()
  return data.notes as ChatNoteDto[]
}

export async function addNote(
  contactId: number,
  content: string,
): Promise<ChatNoteDto | { error: string }> {
  const res = await fetch(`${baseUrl()}/api/chat-notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contactId, content }),
  })
  const data = await res.json()
  if (!res.ok) return { error: data.error ?? "error_desconocido" }
  return data as ChatNoteDto
}

// Solo funciona sobre notas propias — el servidor lo exige (ver
// app/api/chat-notes/[id]/route.ts), así que el botón de editar/borrar en
// la UI solo se muestra sobre las notas del autor actual.
export async function updateNote(id: string, content: string): Promise<ChatNoteDto | { error: string }> {
  const res = await fetch(`${baseUrl()}/api/chat-notes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  })
  const data = await res.json()
  if (!res.ok) return { error: data.error ?? "error_desconocido" }
  return data as ChatNoteDto
}

export async function deleteNote(id: string): Promise<{ ok: true } | { error: string }> {
  const res = await fetch(`${baseUrl()}/api/chat-notes/${id}`, { method: "DELETE" })
  const data = await res.json().catch(() => null)
  if (!res.ok) return { error: data?.error ?? "error_desconocido" }
  return { ok: true }
}
