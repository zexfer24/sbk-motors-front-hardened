// ============================================================================
// Autorización por conversación — quién puede tocar QUÉ chat.
// ============================================================================
// proxy.ts resuelve "quién eres" y bloquea las rutas admin-only, pero no
// puede saber si una conversación concreta es tuya: eso depende de a quién
// esté asignada en Chatwoot. Sin esta comprobación, el filtrado del listado
// (/api/chatwoot/conversations) era puramente cosmético — la UI escondía
// los chats ajenos, pero pegarle directo a
// /api/chatwoot/conversations/<id>/messages los devolvía igual. Los IDs de
// Chatwoot son enteros secuenciales, así que enumerarlos es trivial.
//
// Regla:
//   - admin                       → todo.
//   - asesor con agente vinculado → sus conversaciones + las no asignadas
//                                   (para poder tomarlas).
//   - asesor SIN agente vinculado → solo las no asignadas. Falla CERRADO: un
//                                   usuario mal provisionado debe ver menos,
//                                   nunca más.
// ============================================================================

import { NextResponse } from "next/server"
import { chatwootFetch, getChatwootConfig } from "@/lib/chatwoot/client"
import { CHATWOOT_AGENT_ID_HEADER, USER_ROLE_HEADER } from "@/lib/auth-headers"

const NUMERIC_ID = /^[0-9]{1,18}$/

// Los IDs de conversación de Chatwoot son enteros. Validarlo no es cosmético:
// `id` se interpola en la URL de la API de Chatwoot (ver lib/chatwoot/client.ts),
// así que un valor con separadores o `..` podía desviar la petición a otro
// endpoint de esa API, autenticada con nuestro token.
export function isValidConversationId(id: string): boolean {
  return NUMERIC_ID.test(id)
}

export interface ConversationAssignee {
  assigneeId: number | null
  assigneeName: string | null
}

async function fetchAssignee(id: string): Promise<ConversationAssignee> {
  const raw = await chatwootFetch<Record<string, unknown>>(`/conversations/${id}`, {
    cache: "no-store",
  })
  const meta = (raw.meta as Record<string, unknown>) ?? {}
  const assignee = meta.assignee as Record<string, unknown> | null | undefined
  return {
    assigneeId: assignee && assignee.id != null ? Number(assignee.id) : null,
    assigneeName: assignee && assignee.name != null ? String(assignee.name) : null,
  }
}

type AuthzResult =
  | { ok: false; response: NextResponse }
  // `assignee` es null cuando Chatwoot no está configurado (modo demo).
  | { ok: true; assignee: ConversationAssignee | null }

/**
 * Valida el `id` y comprueba que el llamante pueda operar sobre esa
 * conversación. Devuelve además el asignado, para que quien lo necesite
 * (p. ej. el nombre del asesor de una venta) lo derive del servidor en vez
 * de aceptarlo del cliente.
 */
export async function authorizeConversation(
  request: Request,
  id: string | undefined,
): Promise<AuthzResult> {
  if (!id || !isValidConversationId(id)) {
    return { ok: false, response: NextResponse.json({ error: "id_invalido" }, { status: 400 }) }
  }

  // Sin Chatwoot configurado se opera contra el store de demo en memoria:
  // no hay datos reales de clientes que proteger.
  if (!getChatwootConfig()) return { ok: true, assignee: null }

  let assignee: ConversationAssignee
  try {
    assignee = await fetchAssignee(id)
  } catch {
    // No se pudo confirmar la pertenencia → no se concede el acceso.
    return { ok: false, response: NextResponse.json({ error: "error_chatwoot" }, { status: 502 }) }
  }

  if (request.headers.get(USER_ROLE_HEADER) === "admin") return { ok: true, assignee }

  const rawAgentId = request.headers.get(CHATWOOT_AGENT_ID_HEADER)
  const agentId = rawAgentId && NUMERIC_ID.test(rawAgentId) ? Number(rawAgentId) : null

  // Sin asignar: cualquiera puede tomarla. Asignada: solo su dueño.
  if (assignee.assigneeId === null) return { ok: true, assignee }
  if (agentId !== null && assignee.assigneeId === agentId) return { ok: true, assignee }

  return { ok: false, response: NextResponse.json({ error: "sin_permiso" }, { status: 403 }) }
}

/**
 * Atajo para las rutas que solo necesitan permitir o denegar: devuelve la
 * respuesta de error a retornar tal cual, o `null` si puede continuar.
 */
export async function guardConversationRoute(
  request: Request,
  id: string | undefined,
): Promise<NextResponse | null> {
  const result = await authorizeConversation(request, id)
  return result.ok ? null : result.response
}
