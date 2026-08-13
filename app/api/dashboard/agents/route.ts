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

  const statsByAgent = await getAgentStatsForAll(
    advisors.map((a) => a.chatwootAgentId),
    date,
  )

  const agents = advisors.map((a) => ({
    email: a.email,
    chatwootAgentId: a.chatwootAgentId,
    stats: statsByAgent.get(a.chatwootAgentId) ?? null,
  }))

  return NextResponse.json({ agents, date })
}
