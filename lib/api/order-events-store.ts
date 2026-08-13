// ============================================================================
// Log de auditoría de Ventas — cierre, solicitud/ejecución de devolución y
// confirmación, eliminación. Ver db/order_events_schema.sql. Mismo patrón
// que lib/api/chat-notes-store.ts: Supabase primero, memoria como fallback.
// ============================================================================
// Sin update/delete a propósito — es una bitácora, no un documento editable.
// ============================================================================

import { getSupabase } from "@/lib/supabase/client"
import type { OrderEvent, OrderEventType } from "@/lib/types/order"

const globalForStore = globalThis as unknown as {
  __orderEventsStore?: Map<string, OrderEvent[]>
}

function getMemoryStore(): Map<string, OrderEvent[]> {
  if (!globalForStore.__orderEventsStore) {
    globalForStore.__orderEventsStore = new Map()
  }
  return globalForStore.__orderEventsStore
}

export async function listOrderEvents(orderId: string): Promise<OrderEvent[]> {
  const supabase = getSupabase()

  if (supabase) {
    const { data, error } = await supabase
      .from("order_events")
      .select("id, order_id, event_type, actor_email, actor_name, note, created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true })
    if (error) {
      console.error("order-events: no se pudo leer", error)
      return []
    }
    return (data ?? []).map(fromRow)
  }

  return getMemoryStore().get(orderId) ?? []
}

export async function addOrderEvent(
  orderId: string,
  eventType: OrderEventType,
  actorEmail: string,
  actorName: string,
  note: string | null = null,
): Promise<OrderEvent | { error: string }> {
  const supabase = getSupabase()

  if (supabase) {
    const { data, error } = await supabase
      .from("order_events")
      .insert({ order_id: orderId, event_type: eventType, actor_email: actorEmail, actor_name: actorName, note })
      .select("id, order_id, event_type, actor_email, actor_name, note, created_at")
      .single()
    if (error) {
      console.error("order-events: no se pudo guardar", error)
      return { error: "error_supabase" }
    }
    return fromRow(data)
  }

  const event: OrderEvent = {
    id: crypto.randomUUID(),
    orderId,
    eventType,
    actorEmail,
    actorName,
    note,
    createdAt: new Date().toISOString(),
  }
  const store = getMemoryStore()
  const list = store.get(orderId) ?? []
  list.push(event)
  store.set(orderId, list)
  return event
}

function fromRow(row: Record<string, unknown>): OrderEvent {
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    eventType: String(row.event_type) as OrderEventType,
    actorEmail: String(row.actor_email),
    actorName: String(row.actor_name ?? ""),
    note: row.note != null ? String(row.note) : null,
    createdAt: String(row.created_at),
  }
}
