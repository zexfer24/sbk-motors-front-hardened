// ============================================================================
// Filtro de estado de la lista de conversaciones — separado de
// components/chat/conversation-list.tsx para poder probarlo sin renderizar
// React (no hay jsdom/RTL en este repo, ver lib/chatwoot-messages.ts para el
// mismo patrón de extracción).
// ============================================================================

import type { ChatwootConversation } from "@/lib/types/chatwoot"

export type StatusKey = "pending" | "open_human" | "unassigned" | "assigned" | "resolved"

export const STATUS_FILTERS: { key: StatusKey; label: string }[] = [
  { key: "pending", label: "Sin contestar" },
  { key: "open_human", label: "Abiertas" },
  { key: "unassigned", label: "Libres" },
  { key: "assigned", label: "Asignados" },
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
//
// 2026-08-18 (pedido explícito del cliente): reintroduce "Asignados" — un
// filtro que existía antes en la bandeja y se había quitado por generar
// percepción de inequidad entre asesores (mostraba TODO lo asignado del
// equipo, no solo lo propio). A diferencia de "Abiertas"/"Sin contestar"
// (que desde el 2026-08-16 muestran el estado de TODO el equipo, ver nota
// de arriba), este se mantiene scoped a "lo mío" a propósito — mismo
// criterio que ya usa "Mis conversaciones asignadas" en
// components/views/operations-center-view.tsx — para no reintroducir el
// problema que motivó quitarlo. Necesita `viewerAgentId` (el
// chatwootAgentId de quien está mirando la bandeja); sin él (null) no
// matchea nada, a propósito — mejor una lista vacía que mostrar "asignados"
// de cualquiera cuando no se sabe quién pregunta.
export function matchesStatus(
  c: ChatwootConversation,
  status: StatusKey,
  viewerAgentId: number | null = null,
): boolean {
  const assigneeId = c.assigneeId ?? null
  switch (status) {
    case "unassigned":
      return c.status === "open" && assigneeId === null && c.unreadCount > 0
    case "pending":
      return c.status === "open" && c.unreadCount > 0
    case "open_human":
      return c.status === "open" && assigneeId !== null && c.unreadCount === 0
    case "assigned":
      return c.status === "open" && viewerAgentId !== null && assigneeId === viewerAgentId
    case "resolved":
      return c.status === "resolved"
  }
}

// Agrupa una lista YA FILTRADA (se usa para el filtro "Asignados", ver
// arriba) en dos secciones — "No leídos" primero, "Leídos" después — en vez
// de una lista plana donde lo urgente se mezcla con lo que ya se contestó.
// Extraído aparte del render (components/chat/conversation-list.tsx) para
// poder probar el agrupamiento sin renderizar React, mismo patrón que
// matchesStatus. Preserva el orden relativo de entrada dentro de cada
// sección (el caller ya ordenó por lastMessageAt antes de llamar acá).
export function groupByReadStatus<T extends { unreadCount: number }>(
  conversations: T[],
): { unread: T[]; read: T[] } {
  const unread: T[] = []
  const read: T[] = []
  for (const c of conversations) {
    ;(c.unreadCount > 0 ? unread : read).push(c)
  }
  return { unread, read }
}
