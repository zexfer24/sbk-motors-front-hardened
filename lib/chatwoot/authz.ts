// ============================================================================
// Autorización por conversación — quién puede VER y quién puede ESCRIBIR.
// ============================================================================
// proxy.ts resuelve "quién eres" y bloquea las rutas admin-only, pero no
// puede saber si una conversación concreta es tuya: eso depende de a quién
// esté asignada en Chatwoot. Sin esta comprobación, un filtrado solo en el
// listado (/api/chatwoot/conversations) sería puramente cosmético — pegarle
// directo a /api/chatwoot/conversations/<id>/messages lo saltaría. Los IDs
// de Chatwoot son enteros secuenciales, así que enumerarlos es trivial.
//
// LECTURA vs ESCRITURA están separadas a propósito: el negocio pidió que
// todo el equipo vea siempre todas las conversaciones (colaboración,
// cobertura si alguien falta), pero que solo pueda ESCRIBIR quien la tiene
// asignada — el admin (supervisor) puede escribir siempre, en cualquiera.
//
// Reglas:
//   LECTURA  — cualquier usuario autenticado, cualquier conversación.
//   ESCRITURA (mandar mensaje, cerrar venta, etiquetar) —
//     - admin                       → todo.
//     - asesor con agente vinculado → solo la conversación asignada a él.
//     - asesor SIN agente vinculado → ninguna (falla CERRADO).
//   /intervene (tomar/soltar el control) tiene su propia regla, ver ese
//   route.ts: tomar un chat SIN asignar sigue abierto a cualquier asesor.
// ============================================================================

import { NextResponse } from "next/server"
import { chatwootFetch, getChatwootConfig } from "@/lib/chatwoot/client"
import { CHATWOOT_AGENT_ID_HEADER, CHATWOOT_API_TOKEN_HEADER, USER_ROLE_HEADER } from "@/lib/auth-headers"

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

export async function fetchAssignee(id: string): Promise<ConversationAssignee> {
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

export function callerIsAdmin(request: Request): boolean {
  return request.headers.get(USER_ROLE_HEADER) === "admin"
}

export function callerAgentId(request: Request): number | null {
  const raw = request.headers.get(CHATWOOT_AGENT_ID_HEADER)
  return raw && NUMERIC_ID.test(raw) ? Number(raw) : null
}

// Token personal de Chatwoot del asesor que llama (ver proxy.ts,
// app_metadata.chatwoot_api_token en Supabase — infra lo carga a mano, acá
// solo se lee). Null si no hay sesión, no está vinculado, o es un admin —
// quien lo use debe caer al token compartido (config.apiToken en
// lib/chatwoot/client.ts) cuando es null, nunca bloquear el envío por su
// ausencia.
export function callerApiToken(request: Request): string | null {
  const raw = request.headers.get(CHATWOOT_API_TOKEN_HEADER)
  return raw && raw.trim().length > 0 ? raw : null
}

// admin siempre puede escribir; un asesor solo si la conversación está
// asignada a él. A propósito NO incluye "sin asignar" — para tomar un chat
// libre hay que pasar primero por /intervene.
export function canWriteAssignee(
  assignee: ConversationAssignee,
  isAdmin: boolean,
  agentId: number | null,
): boolean {
  if (isAdmin) return true
  return agentId !== null && assignee.assigneeId === agentId
}

type AuthzResult =
  | { ok: false; response: NextResponse }
  // `assignee` es null cuando Chatwoot no está configurado (modo demo).
  | { ok: true; assignee: ConversationAssignee | null }

async function resolveConversation(
  request: Request,
  id: string | undefined,
): Promise<AuthzResult> {
  if (!id || !isValidConversationId(id)) {
    return { ok: false, response: NextResponse.json({ error: "id_invalido" }, { status: 400 }) }
  }

  // Sin Chatwoot configurado se opera contra el store de demo en memoria:
  // no hay datos reales de clientes que proteger, ni un dueño real que
  // comprobar.
  if (!getChatwootConfig()) return { ok: true, assignee: null }

  try {
    const assignee = await fetchAssignee(id)
    return { ok: true, assignee }
  } catch {
    // No se pudo confirmar el estado real → no se concede el acceso.
    return { ok: false, response: NextResponse.json({ error: "error_chatwoot" }, { status: 502 }) }
  }
}

/**
 * Valida el `id` y confirma que la conversación existe/responde. No
 * restringe por dueño — la lectura es libre para todo el equipo. Devuelve
 * el asignado igual, para que quien lo necesite (p. ej. el nombre del
 * asesor a mostrar en el aviso de "solo lectura") lo derive del servidor
 * en vez de aceptarlo del cliente.
 */
export async function authorizeConversationRead(
  request: Request,
  id: string | undefined,
): Promise<AuthzResult> {
  return resolveConversation(request, id)
}

export async function guardConversationRead(
  request: Request,
  id: string | undefined,
): Promise<NextResponse | null> {
  const result = await authorizeConversationRead(request, id)
  return result.ok ? null : result.response
}

/**
 * Igual que `authorizeConversationRead`, pero además exige que el llamante
 * pueda ESCRIBIR en esa conversación (ver `canWriteAssignee`).
 */
export async function authorizeConversationWrite(
  request: Request,
  id: string | undefined,
): Promise<AuthzResult> {
  const result = await resolveConversation(request, id)
  if (!result.ok) return result
  // Modo demo: sin dueño real, no hay nada que proteger.
  if (!result.assignee) return result

  const isAdmin = callerIsAdmin(request)
  const agentId = callerAgentId(request)
  if (canWriteAssignee(result.assignee, isAdmin, agentId)) return result

  return { ok: false, response: NextResponse.json({ error: "sin_permiso" }, { status: 403 }) }
}

export async function guardConversationWrite(
  request: Request,
  id: string | undefined,
): Promise<NextResponse | null> {
  const result = await authorizeConversationWrite(request, id)
  return result.ok ? null : result.response
}
