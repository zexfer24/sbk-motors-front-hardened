import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { caracasToday, isValidDateStr } from "@/lib/caracas-time"
import { getAgentStatsForAll } from "@/lib/chatwoot-agent-stats"

// Métricas por asesor del Centro de Control — admin-only (todo /api/dashboard
// lo es, ver proxy.ts). Reusa el mismo criterio que /api/agents (rol
// asesor + chatwoot_agent_id vinculado) para saber a quién calcularle
// métricas; ver lib/chatwoot-agent-stats.ts para las fórmulas.
export async function GET(request: Request) {
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
  const { data, error } = await supabase.auth.admin.listUsers()
  if (error) {
    return NextResponse.json({ error: "error_supabase" }, { status: 502 })
  }

  const advisors = data.users
    .map((u) => ({
      email: u.email ?? "",
      role: u.app_metadata?.role === "admin" ? "admin" : "asesor",
      chatwootAgentId:
        typeof u.app_metadata?.chatwoot_agent_id === "number" ? u.app_metadata.chatwoot_agent_id : null,
    }))
    .filter(
      (a): a is { email: string; role: string; chatwootAgentId: number } =>
        a.role === "asesor" && a.chatwootAgentId !== null,
    )

  // La tabla `asesores` la creó infraestructura directamente en Supabase
  // para la lógica de auto-asignación de n8n (columnas: id,
  // chatwoot_user_id, nombre, activo, ultima_asignacion) — no vive en
  // db/*.sql de este repo porque este repo no la creó. Se lee por
  // chatwoot_user_id, el mismo id que ya usa el resto del sistema como
  // chatwootAgentId. Ver db/asesores_schema_reference.md.
  const [statsByAgent, asesoresResult] = await Promise.all([
    getAgentStatsForAll(
      advisors.map((a) => a.chatwootAgentId),
      date,
    ),
    supabase.from("asesores").select("chatwoot_user_id, activo"),
  ])

  const activeByAgent = new Map<number, boolean>()
  if (asesoresResult.error) {
    console.error("dashboard/agents: no se pudo leer `asesores`", asesoresResult.error)
  } else {
    for (const row of asesoresResult.data ?? []) {
      if (typeof row.chatwoot_user_id === "number") {
        activeByAgent.set(row.chatwoot_user_id, Boolean(row.activo))
      }
    }
  }

  const agents = advisors.map((a) => ({
    email: a.email,
    chatwootAgentId: a.chatwootAgentId,
    stats: statsByAgent.get(a.chatwootAgentId) ?? null,
    // null = no hay fila en `asesores` para este chatwoot_user_id (tabla
    // gestionada por n8n para la asignación automática, ver
    // db/asesores_schema_reference.md) — la UI debe tratarlo como "sin
    // dato", no como false.
    activo: activeByAgent.get(a.chatwootAgentId) ?? null,
  }))

  return NextResponse.json({ agents, date })
}
