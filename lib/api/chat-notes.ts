export interface ChatNoteDto {
  id: string
  authorEmail: string
  content: string
  createdAt: string
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
