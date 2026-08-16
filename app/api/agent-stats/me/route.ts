import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { caracasToday, isValidDateStr } from "@/lib/caracas-time"
import { getAgentStatsForAll } from "@/lib/chatwoot-agent-stats"
import { callerAgentId } from "@/lib/chatwoot/authz"

// Métricas del propio asesor para el Centro de Operaciones (vista por
// defecto del Chat sin conversación seleccionada, components/views/chat-view.tsx).
// A diferencia de /api/dashboard/agents (admin-only, TODOS los asesores),
// esta ruta a propósito NO vive bajo /api/dashboard (ver isAdminOnlyApi en
// proxy.ts) — cualquier asesor autenticado puede pedir SU PROPIO dato sin
// necesitar el rol admin. El agente se resuelve del lado servidor con
// callerAgentId (header que pone proxy.ts a partir de la sesión, nunca algo
// que mande el cliente), así que por esta vía nadie puede pedir las
// métricas de otro asesor.
export async function GET(request: Request) {
  const agentId = callerAgentId(request)
  if (agentId === null) {
    return NextResponse.json({ chatwootAgentId: null, stats: null, activo: null })
  }

  const dateParam = new URL(request.url).searchParams.get("date")
  if (dateParam && !isValidDateStr(dateParam)) {
    return NextResponse.json({ error: "fecha_invalida" }, { status: 400 })
  }
  const date = dateParam && dateParam <= caracasToday() ? dateParam : caracasToday()

  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: "autenticacion_no_configurada" }, { status: 503 })
  }
  const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } })

  const [statsByAgent, asesorResult] = await Promise.all([
    getAgentStatsForAll([agentId], date),
    supabase.from("asesores").select("activo").eq("chatwoot_user_id", agentId).maybeSingle(),
  ])

  if (asesorResult.error) {
    console.error("agent-stats/me: no se pudo leer `asesores`", asesorResult.error)
  }

  return NextResponse.json({
    chatwootAgentId: agentId,
    stats: statsByAgent.get(agentId) ?? null,
    // null = sin fila en `asesores` para este chatwoot_user_id (ver
    // db/asesores_schema_reference.md) — tratar como "sin dato", no como false.
    activo: asesorResult.data ? Boolean(asesorResult.data.activo) : null,
    date,
  })
}
