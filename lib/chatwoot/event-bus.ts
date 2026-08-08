// ============================================================================
// Bus de eventos en memoria — puente entre el webhook de Chatwoot
// (app/api/chatwoot/webhook) y las conexiones SSE abiertas
// (app/api/chatwoot/events). Igual que lib/rate-limit.ts, esto vive en la
// memoria del proceso: funciona para un solo contenedor/réplica. Si el
// despliegue pasa a tener más de una réplica, esto necesitaría Redis
// (pub/sub) para que el evento llegue a todas las instancias.
// ============================================================================

import { EventEmitter } from "node:events"

export interface ChatwootBusEvent {
  type: "conversation_changed" | "message_changed"
  conversationId: string | null
}

const EVENT_NAME = "chatwoot"

// El webhook (app/api/chatwoot/webhook) y el SSE (app/api/chatwoot/events)
// son dos route files distintos. En dev, Turbopack puede recompilar y
// reevaluar cada uno por separado (fast refresh), lo que dejaría a cada
// ruta con su propia instancia de EventEmitter y nunca se verían el aviso
// del uno al otro. Ancla el emitter a globalThis (mismo patrón que el
// cliente de Prisma en dev) para que sobreviva a esas recompilaciones. En
// producción es un solo proceso Node con un único module cache, así que
// esto no cambia nada ahí — solo evita el problema en dev.
const globalForChatwootBus = globalThis as unknown as { __chatwootBus?: EventEmitter }

const emitter = globalForChatwootBus.__chatwootBus ?? new EventEmitter()
globalForChatwootBus.__chatwootBus = emitter

// Puede haber tantos asesores conectados a la vez como agentes activos;
// el límite por defecto de Node (10) dispararía warnings sin ser un leak real.
emitter.setMaxListeners(0)

export function publishChatwootEvent(event: ChatwootBusEvent): void {
  emitter.emit(EVENT_NAME, event)
}

export function subscribeToChatwootEvents(
  handler: (event: ChatwootBusEvent) => void,
): () => void {
  emitter.on(EVENT_NAME, handler)
  return () => emitter.off(EVENT_NAME, handler)
}
