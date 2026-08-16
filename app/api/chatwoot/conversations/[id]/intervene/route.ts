import { NextResponse } from "next/server"
import { getConversation } from "@/lib/api/chatwoot-demo-store"
import { chatwootFetch, getChatwootAgentId, getChatwootAgentName, getChatwootConfig } from "@/lib/chatwoot/client"
import { invalidateConversationsCache } from "@/lib/api/chatwoot-sync"
import { recordSystemEvent } from "@/lib/api/chat-system-events"
import { USER_EMAIL_HEADER } from "@/lib/auth-headers"
import {
  authorizeConversationRead,
  callerAgentId as getCallerAgentId,
  fetchAssignee,
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

// 2026-08-16 (pedido explícito del negocio, ver canWriteAssignee en
// lib/chatwoot/authz.ts): ya no se valida dueño para tomar ni para soltar
// — cualquier autenticado puede intervenir o soltar cualquier
// conversación. Se sigue leyendo el assignee anterior (cuando hace falta)
// para atribuir bien la nota de sistema de "quién soltó a quién", no para
// autorizar nada.
export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params
  if (!id || !isValidConversationId(id)) {
    return NextResponse.json({ error: "id_invalido" }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  const intervene = body?.intervene === true

  const config = getChatwootConfig()
  if (config) {
    const agentId = getCallerAgentId(request)

    // Esta lectura ya NO decide si la acción es válida (eso se sacó, ver
    // el comentario de arriba) — solo hace falta para redactar bien la
    // nota de sistema al SOLTAR (previousAssigneeName: a quién se le quitó
    // el control). Al tomar (intervene=true) esa nota no usa el dueño
    // anterior, así que se salta esta ida y vuelta extra a Chatwoot para
    // cualquiera, no solo para el admin como antes.
    let previousAssigneeId: number | null = null
    let previousAssigneeName: string | null = null
    if (!intervene) {
      const result = await authorizeConversationRead(request, id)
      if (!result.ok) return result.response
      // authorizeConversationRead ya validó el id contra Chatwoot real
      // (config presente) → assignee viene siempre poblado acá, nunca null.
      const assignee = result.assignee!
      previousAssigneeId = assignee.assigneeId
      previousAssigneeName = assignee.assigneeName
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

      // Ventana de carrera real: dos asesores pueden hacer clic en
      // "Intervenir" casi al mismo tiempo sobre el mismo chat, y ambos
      // dispararían este POST — gana el último en llegar a Chatwoot. Sin
      // esta relectura, el que pierde la carrera se queda creyendo (por su
      // propia respuesta 200) que intervino, cuando en realidad Chatwoot
      // ya quedó asignado a otro. Ya NO bloquea la escritura (eso se sacó,
      // ver el comentario de arriba de este mismo archivo) — sigue siendo
      // información real que vale la pena mostrar (a quién quedó asignada
      // de verdad), así que se mantiene como aviso vía el mismo canal de
      // error que ya usaba el front (ver interveneError en
      // components/chat/chat-panel.tsx), solo que ahora nunca implica "no
      // podés escribir". Solo aplica al tomar un chat (intervene=true):
      // soltar (assignee_id=null) es idempotente y no tiene este riesgo.
      if (intervene) {
        const confirmed = await fetchAssignee(id)
        if (confirmed.assigneeId !== assigneeId) {
          return NextResponse.json(
            {
              error: "asignado_por_otro",
              message: `"${confirmed.assigneeName ?? "Otro asesor"}" se adelantó a tomar esta conversación.`,
            },
            { status: 409 },
          )
        }
      }

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
