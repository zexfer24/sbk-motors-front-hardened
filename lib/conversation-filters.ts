// ============================================================================
// Filtro de estado de la lista de conversaciones — separado de
// components/chat/conversation-list.tsx para poder probarlo sin renderizar
// React (no hay jsdom/RTL en este repo, ver lib/chatwoot-messages.ts para el
// mismo patrón de extracción).
// ============================================================================

import type { ChatwootConversation } from "@/lib/types/chatwoot"

export type StatusKey = "pending" | "open_human" | "unassigned" | "resolved"

export const STATUS_FILTERS: { key: StatusKey; label: string }[] = [
  { key: "pending", label: "Sin contestar" },
  { key: "open_human", label: "Abiertas" },
  { key: "unassigned", label: "Libres" },
  { key: "resolved", label: "Cerrados" },
]

// Reglas del negocio (2026-08-12 a 13, ver historial de este archivo antes
// de la extracción): "Sin contestar" y "Abiertas" cubren lo YA ASIGNADO (a
// quien sea) — "Sin contestar" con mensajes sin leer, "Abiertas" al día.
// "Libres" es lo sin asignar y sin contestar; "Cerrados" es por status.
//
// 2026-08-16 (pedido explícito del negocio): "Sin contestar" y "Abiertas"
// dejan de reducirse a "lo mío" para un asesor — antes un asesor sin rol
// admin solo veía ahí las conversaciones asignadas a él mismo, y el resto
// del equipo quedaba fuera de esas dos pestañas (visible igual en la lista
// sin filtro, "Limpiar filtros", pero no ahí). Ahora cualquiera ve el
// estado de TODO el equipo en ambas pestañas, igual que ya veía el admin —
// nada queda fuera de "Sin contestar"/"Abiertas" por motivo de asignación,
// solo por status/leído.
//
// 2026-08-16, más tarde (pedido explícito del negocio): "Sin contestar"
// pasa a abarcar TAMBIÉN lo sin asignar — antes excluía a propósito lo sin
// asignar (eso vivía solo en "Libres"). Ahora "Sin contestar" es todo lo
// abierto con mensajes sin leer, esté o no asignado; "Libres" (sin asignar
// y sin leer) queda como subconjunto de "Sin contestar", no aparte. Solo
// se tocó "pending" — "Abiertas" (open_human) sigue exigiendo asignado,
// no se pidió cambiarla.
export function matchesStatus(c: ChatwootConversation, status: StatusKey): boolean {
  const assigneeId = c.assigneeId ?? null
  switch (status) {
    case "unassigned":
      return c.status === "open" && assigneeId === null && c.unreadCount > 0
    case "pending":
      return c.status === "open" && c.unreadCount > 0
    case "open_human":
      return c.status === "open" && assigneeId !== null && c.unreadCount === 0
    case "resolved":
      return c.status === "resolved"
  }
}
