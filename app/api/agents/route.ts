import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Lista los asesores (cuentas de Supabase Auth) para poblar el selector de
// "Asignar a…" del admin — mismo dato que expone `manage-users.mjs list`,
// pero como API para la UI. admin-only, reforzado en proxy.ts.
export async function GET() {
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

  const agents = data.users
    .map((u) => ({
      email: u.email ?? "",
      role: u.app_metadata?.role === "admin" ? "admin" : "asesor",
      chatwootAgentId:
        typeof u.app_metadata?.chatwoot_agent_id === "number" ? u.app_metadata.chatwoot_agent_id : null,
    }))
    // Solo interesan los asesores con un agente de Chatwoot vinculado — a
    // un admin o a un asesor sin vincular no se le puede asignar nada.
    .filter((a) => a.role === "asesor" && a.chatwootAgentId !== null)

  return NextResponse.json({ agents })
}
