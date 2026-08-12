import { NextResponse } from "next/server"
import { getConversation } from "@/lib/api/chatwoot-demo-store"
import { chatwootFetch, getChatwootAgentId, getChatwootAgentName, getChatwootConfig } from "@/lib/chatwoot/client"
import { invalidateConversationsCache } from "@/lib/api/chatwoot-sync"
import { recordSystemEvent } from "@/lib/api/chat-system-events"
import { USER_EMAIL_HEADER } from "@/lib/auth-headers"
import {
  authorizeConversationRead,
  callerAgentId as getCallerAgentId,
  callerIsAdmin,
  isValidConversationId,
} from "@/lib/chatwoot/authz"

type RouteContext = { params: Promise<{ id: string }> }

// Nombre para la nota de sistema de abajo — el real de Chatwoot si el que
// llama tiene un agente vinculado (getChatwootAgentName), si no el que se
// derive de su correo de sesión (ver displayNameFromEmail más abajo).
async function resolveActorName(request: Request, agentId: number | null): Promise<string> {
  if (agentId !== null) {
    const name = await getChatwootAgentName(agentId)
    if (name) return name
  }
  const email = request.headers.get(USER_EMAIL_HEADER)
  return email ? displayNameFromEmail(email) : "Alguien"
}

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] || email
  return (
    local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || email
  )
}

// Regla propia, distinta de guardConversationWrite: tomar un chat SIN
// asignar sigue abierto a cualquier asesor (ese es el caso de uso de
// "Intervenir"). Solo se bloquea robarle el chat a un compañero (asignado a
// otro) o soltar el control de un chat que no es tuyo — en ambos casos el
// admin puede siempre.
export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params
  if (!id || !isValidConversationId(id)) {
    return NextResponse.json({ error: "id_invalido" }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  const intervene = body?.intervene === true

  const config = getChatwootConfig()
  if (config) {
    const isAdmin = callerIsAdmin(request)
    const agentId = getCallerAgentId(request)

    // Tomar un chat libre como admin no necesita saber quién lo tenía antes
    // (el admin siempre puede) — se salta esta ida y vuelta extra a Chatwoot
    // (antes se hacía SIEMPRE, incluso cuando el resultado no iba a cambiar
    // nada de la decisión) y queda en una sola llamada en vez de dos, que es
    // buena parte de la latencia notada entre tomar/soltar. El resto de los
    // casos sí la necesitan para decidir si la acción es válida, así que
    // siguen igual que antes.
    let previousAssigneeId: number | null = null
    let previousAssigneeName: string | null = null
    if (!(isAdmin && intervene)) {
      const result = await authorizeConversationRead(request, id)
      if (!result.ok) return result.response
      // authorizeConversationRead ya validó el id contra Chatwoot real
      // (config presente) → assignee viene siempre poblado acá, nunca null.
      const assignee = result.assignee!
      previousAssigneeId = assignee.assigneeId
      previousAssigneeName = assignee.assigneeName
      const mine = agentId !== null && previousAssigneeId === agentId

      if (!isAdmin) {
        if (intervene) {
          const takeable = previousAssigneeId === null || mine
          if (!takeable) {
            return NextResponse.json({ error: "sin_permiso" }, { status: 403 })
          }
        } else if (!mine) {
          return NextResponse.json({ error: "sin_permiso" }, { status: 403 })
        }
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

      // "Sistema" cuando quien suelta es quien la tenía (el caso normal de
      // dejar de intervenir); el nombre real de quien la soltó cuando es un
      // admin liberando la de otro asesor (ver recordSystemEvent más abajo,
      // no bloquea la respuesta si falla).
      const releasedBySelf = agentId !== null && previousAssigneeId === agentId
      const noteContent = intervene
        ? `"${await resolveActorName(request, agentId)}" auto-asignado a esta conversación`
        : `"${previousAssigneeName ?? "El asesor"}" fue desasignado por ${
            releasedBySelf ? "Sistema" : await resolveActorName(request, agentId)
          }`
      await recordSystemEvent(id, noteContent)

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
