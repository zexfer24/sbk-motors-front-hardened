// ============================================================================
// Liberar las conversaciones sin contestar de un asesor cuando pasa a
// Inactivo (ver app/api/dashboard/agents/active/route.ts).
//
// Sin esto, el toggle Activo/Inactivo solo tocaba la columna `activo` en
// Supabase y nunca el assignee_id en Chatwoot — las conversaciones ya
// asignadas al asesor se quedaban huérfanas en su cuenta. El resto del
// equipo, al intentar "Intervenir" sobre ellas, chocaba correctamente con el
// 403 de "no le robes el chat a un compañero" (esa regla no se toca, ver
// app/api/chatwoot/conversations/[id]/intervene/route.ts) sin poder saber
// que en realidad el dueño ya no estaba trabajando. Caso real: un asesor
// quedó Inactivo con 15 conversaciones así, y un admin tuvo que reasignarlas
// a mano una por una.
//
// Mismo criterio que matchesStatus 'pending' en
// components/chat/conversation-list.tsx (status==='open' && asignada al
// agente && unreadCount>0) — las ya contestadas (esperando al cliente) no se
// tocan, solo las que de verdad quedaron colgadas.
// ============================================================================

export interface AssignedConversationRow {
  id: string
  unreadCount: number
}

export function selectUnansweredConversationIds(rows: AssignedConversationRow[]): string[] {
  return rows.filter((r) => r.unreadCount > 0).map((r) => r.id)
}

export interface ReleaseDeps {
  fetchAssignedConversations: () => Promise<AssignedConversationRow[] | null>
  unassign: (conversationId: string) => Promise<void>
  recordNote: (conversationId: string, content: string) => Promise<void>
  invalidateCache: () => void
}

export interface ReleaseResult {
  liberadas: number
  errores: number
}

// Un fallo liberando una conversación puntual no debe tumbar el resto —se
// acumula como error y se sigue con las demás. invalidateCache() se llama
// una sola vez al final, y solo si de verdad se liberó algo.
export async function releaseUnansweredConversations(
  agentName: string,
  deps: ReleaseDeps,
): Promise<ReleaseResult> {
  const rows = await deps.fetchAssignedConversations()
  if (!rows || rows.length === 0) return { liberadas: 0, errores: 0 }

  const ids = selectUnansweredConversationIds(rows)
  let liberadas = 0
  let errores = 0

  for (const id of ids) {
    try {
      await deps.unassign(id)
      await deps.recordNote(id, `"${agentName}" quedó sin asignar — el asesor pasó a Inactivo.`)
      liberadas++
    } catch (err) {
      errores++
      console.error(`[release-inactive-agent] no se pudo liberar la conversación ${id}:`, err)
    }
  }

  if (liberadas > 0) deps.invalidateCache()
  return { liberadas, errores }
}
