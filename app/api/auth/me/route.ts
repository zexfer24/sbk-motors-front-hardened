import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"
import { ACCESS_COOKIE } from "@/lib/supabase/session"

// Quién está logueado ahora mismo, según la cookie de sesión — lo usa el
// front para saber qué pestañas mostrar (rol admin vs asesor). El
// middleware ya garantiza que solo se llega aquí con sesión válida en
// condiciones normales, pero esta ruta valida por su cuenta de todas
// formas (por ejemplo, la usa /login para saber si ya hay sesión).

export async function GET() {
  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  // Sin Supabase configurado no hay sesión posible — proxy.ts ya bloquea
  // esta ruta en ese caso, pero se responde igual por si acaso (nunca un
  // usuario de mentira).
  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: "autenticacion_no_configurada" }, { status: 503 })
  }

  const cookieStore = await cookies()
  const accessToken = cookieStore.get(ACCESS_COOKIE)?.value
  if (!accessToken) {
    return NextResponse.json({ error: "no_autenticado" }, { status: 401 })
  }

  const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } })
  const { data, error } = await supabase.auth.getUser(accessToken)

  if (error || !data.user) {
    return NextResponse.json({ error: "no_autenticado" }, { status: 401 })
  }

  const role = data.user.app_metadata?.role === "admin" ? "admin" : "asesor"
  const chatwootAgentId =
    typeof data.user.app_metadata?.chatwoot_agent_id === "number"
      ? data.user.app_metadata.chatwoot_agent_id
      : null
  return NextResponse.json({ email: data.user.email, role, chatwootAgentId })
}
