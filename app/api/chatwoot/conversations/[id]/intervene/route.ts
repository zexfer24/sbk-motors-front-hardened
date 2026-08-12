import { NextResponse } from "next/server"
import { getConversation } from "@/lib/api/chatwoot-demo-store"
import { chatwootFetch, getChatwootAgentId, getChatwootConfig } from "@/lib/chatwoot/client"
import { invalidateConversationsCache } from "@/lib/api/chatwoot-sync"
import {
  authorizeConversationRead,
  callerAgentId as getCallerAgentId,
  callerIsAdmin,
} from "@/lib/chatwoot/authz"

type RouteContext = { params: Promise<{ id: string }> }

// Regla propia, distinta de guardConversationWrite: tomar un chat SIN
// asignar sigue abierto a cualquier asesor (ese es el caso de uso de
// "Intervenir"). Solo se bloquea robarle el chat a un compañero (asignado a
// otro) o soltar el control de un chat que no es tuyo — en ambos casos el
// admin puede siempre.
export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params
  const result = await authorizeConversationRead(request, id)
  if (!result.ok) return result.response

  const body = await request.json().catch(() => null)
  const intervene = body?.intervene === true

  const config = getChatwootConfig()
  if (config) {
    const isAdmin = callerIsAdmin(request)
    const agentId = getCallerAgentId(request)
    // authorizeConversationRead ya validó el id contra Chatwoot real (config
    // presente) → assignee viene siempre poblado acá, nunca null.
    const assignee = result.assignee!
    const mine = agentId !== null && assignee.assigneeId === agentId

    if (!isAdmin) {
      if (intervene) {
        const takeable = assignee.assigneeId === null || mine
        if (!takeable) {
          return NextResponse.json({ error: "sin_permiso" }, { status: 403 })
        }
      } else if (!mine) {
        return NextResponse.json({ error: "sin_permiso" }, { status: 403 })
      }
    }

    try {
      // Se asigna al agente de Chatwoot de quien está interviniendo *ahora
      // mismo* (según su sesión, ver proxy.ts) — no siempre al dueño
      // del token compartido. Si el usuario logueado no tiene un agente de
      // Chatwoot vinculado (ver `chatwoot_agent_id` en scripts/manage-users.mjs),
      // cae al agente del token como antes.
      const assigneeId = intervene ? (agentId ?? (await getChatwootAgentId())) : null
      await chatwootFetch(`/conversations/${id}/assignments`, {
        method: "POST",
        body: JSON.stringify({ assignee_id: assigneeId }),
      })
      // Sin esto, una recarga del listado disparada por el SSE justo
      // después de este POST podía servir el snapshot de antes del cambio
      // (ver invalidateConversationsCache) — visualmente, como si
      // "Intervenir" no hubiera hecho nada.
      invalidateConversationsCache()
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
