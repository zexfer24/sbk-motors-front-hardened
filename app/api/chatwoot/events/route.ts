// ============================================================================
// SSE (Server-Sent Events) — empuja al front los avisos que llegan por el
// webhook de Chatwoot (ver app/api/chatwoot/webhook). El front escucha esta
// conexión en vez de preguntar cada 5-6s si hay algo nuevo.
// ============================================================================
// No lleva el contenido del mensaje ni datos del cliente — solo "algo cambió
// en la conversación X, vuelve a pedirla". La autorización real (quién
// puede ver qué conversación) sigue viviendo donde ya vivía: en
// /api/chatwoot/conversations (filtra la lista) y en guardConversationRoute
// (401/403 al pedir mensajes de una conversación ajena). Mandar el aviso a
// todo el que esté conectado no expone nada que esas rutas no vuelvan a
// verificar por su cuenta.
// ============================================================================

import { subscribeToChatwootEvents, type ChatwootBusEvent } from "@/lib/chatwoot/event-bus"

export const dynamic = "force-dynamic"

const HEARTBEAT_MS = 25_000

export async function GET(request: Request) {
  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: ChatwootBusEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      unsubscribe = subscribeToChatwootEvents(send)

      // Comentario SSE (":"), no un evento — mantiene viva la conexión a
      // través de proxies/reverse-proxies (Dokploy/Traefik) que cierran
      // sockets inactivos.
      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`))
      }, HEARTBEAT_MS)

      const cleanup = () => {
        unsubscribe?.()
        if (heartbeat) clearInterval(heartbeat)
      }
      request.signal.addEventListener("abort", cleanup)
    },
    cancel() {
      unsubscribe?.()
      if (heartbeat) clearInterval(heartbeat)
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
