// ============================================================================
// Fallback en memoria — solo entra en juego si SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY no están configuradas. Ver db/quick_replies_schema.sql.
// ============================================================================

import type { QuickReply } from "@/lib/quick-replies"

const globalForStore = globalThis as unknown as { __quickRepliesStore?: QuickReply[] }

function getStore(): QuickReply[] {
  if (!globalForStore.__quickRepliesStore) {
    // Misma respuesta de ejemplo que traía el arreglo fijo original, para
    // que el modo demo no arranque vacío.
    globalForStore.__quickRepliesStore = [
      {
        id: globalThis.crypto.randomUUID(),
        label: "Datos de pago",
        content:
          "[Completa aquí los datos reales de pago de SBK Motors: Pago Móvil (banco, cédula/RIF, teléfono), Zelle, etc.]",
      },
    ]
  }
  return globalForStore.__quickRepliesStore
}

export function listQuickReplies(): QuickReply[] {
  return [...getStore()]
}

export function createQuickReply(input: { label: string; content: string }): QuickReply {
  const reply: QuickReply = { id: globalThis.crypto.randomUUID(), ...input }
  getStore().push(reply)
  return reply
}

export function updateQuickReply(
  id: string,
  input: { label: string; content: string },
): QuickReply | null {
  const reply = getStore().find((r) => r.id === id)
  if (!reply) return null
  reply.label = input.label
  reply.content = input.content
  return reply
}

export function deleteQuickReply(id: string): boolean {
  const store = getStore()
  const index = store.findIndex((r) => r.id === id)
  if (index === -1) return false
  store.splice(index, 1)
  return true
}
