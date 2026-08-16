// ============================================================================
// Autorización por conversación — confirma que el id sea real contra
// Chatwoot antes de dejar leer o escribir.
// ============================================================================
// proxy.ts resuelve "quién eres" y bloquea las rutas admin-only, pero no
// valida que una conversación concreta exista de verdad: sin esto, un
// filtrado solo en el listado (/api/chatwoot/conversations) sería
// puramente cosmético — pegarle directo a
// /api/chatwoot/conversations/<id>/messages con cualquier id lo saltaría.
// Los IDs de Chatwoot son enteros secuenciales, así que enumerarlos es
// trivial.
//
// 2026-08-16 (pedido explícito del negocio): LECTURA y ESCRITURA son
// libres para cualquier usuario autenticado, sin importar a quién esté
// asignada la conversación en Chatwoot — un incidente de n8n (workflow en
// bucle) reasignó chats a la persona equivocada, y la restricción de
// escritura anterior ("solo escribe quien la tiene asignada") bloqueaba
// con 403 al asesor real. Ver canWriteAssignee más abajo, siempre `true`.
// /intervene (tomar/soltar el control) tiene su propia ruta, ver ese
// route.ts.
// ============================================================================

import { NextResponse } from "next/server"
import { chatwootFetch, getChatwootConfig } from "@/lib/chatwoot/client"
import { CHATWOOT_AGENT_ID_HEADER, CHATWOOT_API_TOKEN_HEADER } from "@/lib/auth-headers"

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

// 2026-08-16 (pedido explícito del negocio): antes solo podía escribir
// quien tenía la conversación asignada — un incidente de n8n (workflow en
// bucle) reasignó varias conversaciones a la persona equivocada, y esa
// regla bloqueaba con 403 al asesor real que necesitaba responderle a su
// propio cliente. En vez de perseguir cada caso mal asignado, se saca la
// restricción del todo: cualquier usuario autenticado puede escribir en
// cualquier conversación, sin importar a quién esté asignada en Chatwoot —
// mismo criterio que ya regía la lectura. `authorizeConversationWrite`
// sigue validando que la conversación exista de verdad contra Chatwoot,
// eso no cambia.
export function canWriteAssignee(): boolean {
  return true
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
 * el asignado igual, para que quien lo necesite (p. ej. el badge de
 * asesor asignado en components/chat/chat-panel.tsx) lo derive del
 * servidor en vez de aceptarlo del cliente.
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
 * Igual que `authorizeConversationRead` — la escritura ya no exige nada
 * extra sobre quién tiene la conversación asignada (ver `canWriteAssignee`,
 * siempre `true`). Se mantiene como función propia, en vez de fusionarla
 * con `authorizeConversationRead`, para conservar el seam por si el
 * negocio pide reintroducir la restricción más adelante.
 */
export async function authorizeConversationWrite(
  request: Request,
  id: string | undefined,
): Promise<AuthzResult> {
  const result = await resolveConversation(request, id)
  if (!result.ok) return result
  if (canWriteAssignee()) return result

  return { ok: false, response: NextResponse.json({ error: "sin_permiso" }, { status: 403 }) }
}

export async function guardConversationWrite(
  request: Request,
  id: string | undefined,
): Promise<NextResponse | null> {
  const result = await authorizeConversationWrite(request, id)
  return result.ok ? null : result.response
}
