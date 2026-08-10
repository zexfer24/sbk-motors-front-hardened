import type { QuickReply } from "@/lib/quick-replies"

function baseUrl() {
  if (typeof window !== "undefined") return ""
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
}

export async function fetchQuickReplies(): Promise<QuickReply[]> {
  const res = await fetch(`${baseUrl()}/api/quick-replies`, { cache: "no-store" })
  if (!res.ok) throw new Error("No se pudieron cargar las respuestas rápidas")
  const data = await res.json()
  return data.replies as QuickReply[]
}

export async function createQuickReply(input: {
  label: string
  content: string
}): Promise<QuickReply | { error: string }> {
  const res = await fetch(`${baseUrl()}/api/quick-replies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  const data = await res.json()
  if (!res.ok) return { error: data.error ?? "error_desconocido" }
  return data as QuickReply
}

export async function updateQuickReply(
  id: string,
  input: { label: string; content: string },
): Promise<QuickReply | { error: string }> {
  const res = await fetch(`${baseUrl()}/api/quick-replies/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  const data = await res.json()
  if (!res.ok) return { error: data.error ?? "error_desconocido" }
  return data as QuickReply
}

export async function deleteQuickReply(id: string): Promise<{ ok: true } | { error: string }> {
  const res = await fetch(`${baseUrl()}/api/quick-replies/${id}`, { method: "DELETE" })
  const data = await res.json()
  if (!res.ok) return { error: data.error ?? "error_desconocido" }
  return { ok: true }
}
