import { NextResponse } from "next/server"
import { getConversation } from "@/lib/api/chatwoot-demo-store"
import { chatwootFetch, getChatwootAgentId, getChatwootConfig } from "@/lib/chatwoot/client"
import { CHATWOOT_AGENT_ID_HEADER } from "@/lib/auth-headers"
import { guardConversationRoute } from "@/lib/chatwoot/authz"

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params
  // Reasignar el chat de otro (robarlo o dejarlo huérfano) era posible sin
  // ninguna comprobación. Las conversaciones sin asignar siguen siendo
  // tomables por cualquiera — eso es el caso de uso legítimo de "Intervenir".
  const denied = await guardConversationRoute(request, id)
  if (denied) return denied

  const body = await request.json().catch(() => null)
  const intervene = body?.intervene === true

  const config = getChatwootConfig()
  if (config) {
    try {
      // Se asigna al agente de Chatwoot de quien está interviniendo *ahora
      // mismo* (según su sesión, ver proxy.ts) — no siempre al dueño
      // del token compartido. Si el usuario logueado no tiene un agente de
      // Chatwoot vinculado (ver `chatwoot_agent_id` en scripts/manage-users.mjs),
      // cae al agente del token como antes.
      // El header ya no es falseable: proxy.ts lo borra antes de fijarlo,
      // así que si está presente lo puso el servidor a partir de la sesión.
      const rawAgentId = request.headers.get(CHATWOOT_AGENT_ID_HEADER)
      const callerAgentId = rawAgentId && /^[0-9]{1,18}$/.test(rawAgentId) ? Number(rawAgentId) : 0
      const assigneeId = intervene
        ? callerAgentId > 0
          ? callerAgentId
          : await getChatwootAgentId()
        : null
      await chatwootFetch(`/conversations/${id}/assignments`, {
        method: "POST",
        body: JSON.stringify({ assignee_id: assigneeId }),
      })
      return NextResponse.json({ handledBy: intervene ? "human" : "ai" })
    } catch {
      return NextResponse.json({ error: "error_chatwoot" }, { status: 502 })
    }
  }

  const conv = getConversation(id)
  if (!conv) {
    return NextResponse.json({ error: "no_encontrado" }, { status: 404 })
  }

  return NextResponse.json({ handledBy: intervene ? "human" : "ai" })
}
