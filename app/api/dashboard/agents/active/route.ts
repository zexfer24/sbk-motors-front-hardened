import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { fetchAssignedOpenConversations } from "@/lib/api/chatwoot-db"
import { releaseUnansweredConversations } from "@/lib/api/release-inactive-agent"
import { chatwootFetch, getChatwootAgentName, getChatwootConfig } from "@/lib/chatwoot/client"
import { invalidateConversationsCache } from "@/lib/api/chatwoot-sync"
import { recordSystemEvent } from "@/lib/api/chat-system-events"

// Cambia el Activo/Inactivo de un asesor en la tabla `asesores` (ver
// db/asesores_schema_reference.md) — admin-only, cubierto por el prefijo
// /api/dashboard en proxy.ts. Esto controla la auto-asignación real de
// chats nuevos en n8n, así que solo toca `activo`, nunca otra columna.
//
// Al pasar a Inactivo, además libera en Chatwoot las conversaciones que ya
// tenía asignadas y siguen sin contestar (ver
// lib/api/release-inactive-agent.ts para el porqué completo) — nunca toca
// las ya contestadas, y nunca toca el camino de marcar Activo.
export async function POST(request: Request) {
  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: "autenticacion_no_configurada" }, { status: 503 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "cuerpo_invalido" }, { status: 400 })
  }

  const { chatwootAgentId, activo } = body as Record<string, unknown>
  if (typeof chatwootAgentId !== "number" || !Number.isInteger(chatwootAgentId)) {
    return NextResponse.json({ error: "asesor_invalido" }, { status: 400 })
  }
  if (typeof activo !== "boolean") {
    return NextResponse.json({ error: "estado_invalido" }, { status: 400 })
  }

  const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } })
  const { data, error } = await supabase
    .from("asesores")
    .update({ activo })
    .eq("chatwoot_user_id", chatwootAgentId)
    .select("chatwoot_user_id, activo")
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: "error_supabase" }, { status: 502 })
  }
  if (!data) {
    return NextResponse.json({ error: "asesor_no_encontrado_en_asesores" }, { status: 404 })
  }

  let liberadas = 0
  if (activo === false && getChatwootConfig()) {
    const config = getChatwootConfig()!
    const agentName = (await getChatwootAgentName(chatwootAgentId)) ?? "El asesor"
    const result = await releaseUnansweredConversations(agentName, {
      fetchAssignedConversations: () => fetchAssignedOpenConversations(config.accountId, chatwootAgentId),
      unassign: async (conversationId) => {
        await chatwootFetch(`/conversations/${conversationId}/assignments`, {
          method: "POST",
          body: JSON.stringify({ assignee_id: null }),
        })
      },
      recordNote: (conversationId, content) => recordSystemEvent(conversationId, content),
      invalidateCache: invalidateConversationsCache,
    })
    liberadas = result.liberadas
  }

  return NextResponse.json({ chatwootAgentId: data.chatwoot_user_id, activo: data.activo, liberadas })
}
