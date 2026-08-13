import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Cambia el Activo/Inactivo de un asesor en la tabla `asesores` (ver
// db/asesores_schema_reference.md) — admin-only, cubierto por el prefijo
// /api/dashboard en proxy.ts. Esto controla la auto-asignación real de
// chats nuevos en n8n, así que solo toca `activo`, nunca otra columna.
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
  return NextResponse.json({ chatwootAgentId: data.chatwoot_user_id, activo: data.activo })
}
