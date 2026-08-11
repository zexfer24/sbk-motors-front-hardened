// ============================================================================
// Etiquetas (labels) de Chatwoot — catálogo de la cuenta + asignación por
// conversación. Es lo que cubre el pedido de "categorías": son las labels
// nativas de Chatwoot, no un sistema paralelo — así el catálogo se
// administra en un solo lugar y queda visible también si alguien entra
// directo al propio Chatwoot.
// ============================================================================
// Los nombres de campo del body de creación (title/color/description/
// show_on_sidebar, sin envolver en un objeto padre) siguen la forma pública
// documentada de la API de labels de Chatwoot. Conviene confirmarlos con una
// creación de prueba contra la cuenta real antes de depender de esto a
// ciegas en producción — si el body esperado resultara distinto, esta
// función es el único lugar que hay que tocar.
// ============================================================================

import { chatwootFetch } from "@/lib/chatwoot/client"

export interface ChatwootLabel {
  id: number
  title: string
  description: string | null
  color: string
  showOnSidebar: boolean
}

function mapLabel(raw: Record<string, unknown>): ChatwootLabel {
  return {
    id: Number(raw.id ?? 0),
    title: String(raw.title ?? ""),
    description: raw.description != null ? String(raw.description) : null,
    color: String(raw.color ?? "#94a3b8"),
    showOnSidebar: Boolean(raw.show_on_sidebar),
  }
}

export async function listAccountLabels(): Promise<ChatwootLabel[]> {
  const data = await chatwootFetch<{ payload: Record<string, unknown>[] }>("/labels", {
    cache: "no-store",
  })
  return data.payload.map(mapLabel)
}

export async function createAccountLabel(input: {
  title: string
  color: string
  description?: string
}): Promise<ChatwootLabel> {
  const data = await chatwootFetch<Record<string, unknown>>("/labels", {
    method: "POST",
    body: JSON.stringify({
      title: input.title,
      color: input.color,
      description: input.description ?? "",
      show_on_sidebar: true,
    }),
  })
  return mapLabel(data)
}

// Chatwoot devuelve/recibe las labels de una conversación como una lista de
// títulos (strings), no de objetos completos — a diferencia del catálogo de
// cuenta de arriba.
export async function getConversationLabels(conversationId: string): Promise<string[]> {
  const data = await chatwootFetch<{ payload: string[] }>(
    `/conversations/${conversationId}/labels`,
    { cache: "no-store" },
  )
  return Array.isArray(data.payload) ? data.payload : []
}

// Reemplaza la lista completa de etiquetas de la conversación (no es un
// "agregar una" — quien llama manda el set final deseado).
export async function setConversationLabels(
  conversationId: string,
  labels: string[],
): Promise<string[]> {
  const data = await chatwootFetch<{ payload: string[] }>(
    `/conversations/${conversationId}/labels`,
    { method: "POST", body: JSON.stringify({ labels }) },
  )
  return Array.isArray(data.payload) ? data.payload : labels
}
