// ============================================================================
// Fallback en memoria — solo entra en juego si SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY no están configuradas. Arranca vacío a
// propósito: sin datos mock. El inventario real vive en `saprod` (ver
// db/SUPABASE_CONNECTION.md) y es de solo lectura, así que este store
// tampoco expone forma de crear artículos.
// ============================================================================

import type { InventoryItemDb } from "@/lib/types/inventory"

const globalForStore = globalThis as unknown as { __inventoryStore?: InventoryItemDb[] }

function getStore(): InventoryItemDb[] {
  if (!globalForStore.__inventoryStore) {
    globalForStore.__inventoryStore = []
  }
  return globalForStore.__inventoryStore
}

export function listItems(): InventoryItemDb[] {
  return [...getStore()].sort((a, b) => a.name.localeCompare(b.name))
}
