// ============================================================================
// Etiquetas (labels) de Chatwoot — catálogo de la cuenta + asignación por
// conversación. Es lo que cubre el pedido de "categorías": son las labels
// nativas de Chatwoot, no un sistema paralelo — así el catálogo se
// administra en un solo lugar y queda visible también si alguien entra
// directo al propio Chatwoot.
// ============================================================================
// Confirmado contra el código fuente de Chatwoot (Api::V1::Accounts::LabelsController):
// create/update exigen el body envuelto en la clave "label"
// (params.require(:label).permit(:title, :description, :color,
// :show_on_sidebar)) — un body plano (como se mandaba antes acá) dispara
// ActionController::ParameterMissing (400) del lado de Chatwoot, que es
// justo el motivo por el que crear categorías no funcionaba. `fetch_label`
// resuelve por id numérico (Current.account.labels.find(params[:id])), no
// por título — coincide con el `id: number` que ya usa ChatwootLabel acá.
// ============================================================================

import { chatwootFetch } from "@/lib/chatwoot/client"

// Chatwoot valida el título contra `\A[\p{L}\p{N}]+[\p{L}\p{N}_-]+\Z`
// (confirmado contra su código fuente real, app/models/label.rb +
// lib/regex_helper.rb) y lo pasa a minúsculas antes de validar — un
// espacio, mayúscula o símbolo cualquiera dispara un 400 de su lado. En vez
// de dejar que "Repuestos moto" truene con un error críptico, se limpia acá
// antes de mandarlo: espacios a guion, todo lo demás fuera de ese charset
// se descarta, y no puede empezar con guion/guion bajo (el regex exige que
// arranque con letra o número).
export function slugifyLabelTitle(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]+/gu, "")
    .replace(/^[-_]+/, "")
}

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
      label: {
        title: input.title,
        color: input.color,
        description: input.description ?? "",
        show_on_sidebar: true,
      },
    }),
  })
  return mapLabel(data)
}

export async function updateAccountLabel(
  id: number,
  input: { title: string; color: string; description?: string },
): Promise<ChatwootLabel> {
  const data = await chatwootFetch<Record<string, unknown>>(`/labels/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      label: {
        title: input.title,
        color: input.color,
        description: input.description ?? "",
        show_on_sidebar: true,
      },
    }),
  })
  return mapLabel(data)
}

export async function deleteAccountLabel(id: number): Promise<void> {
  await chatwootFetch(`/labels/${id}`, { method: "DELETE" })
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
