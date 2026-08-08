// ============================================================================
// Cliente de Supabase — SOLO de servidor.
// ============================================================================
// Usa la service_role key, que tiene permisos completos y bypassa RLS. Por
// eso esta key NUNCA debe tener el prefijo NEXT_PUBLIC_ ni llegar al
// navegador — solo se lee aquí, en código que corre en rutas API de Next.js
// (app/api/*), nunca en componentes de cliente ("use client").
//
// Inventario y Contactos viven en las mismas credenciales (mismo proyecto
// de Supabase, mismo `service_role`), solo cambian de tabla — por eso un
// único cliente compartido es suficiente para ambos.
//
// Si las variables de entorno no están configuradas, getSupabase() devuelve
// null y las rutas que lo usan caen automáticamente a su modo demo (datos
// en memoria) — así puedes seguir trabajando en el front sin tener las
// credenciales a mano todavía.
// ============================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let cached: SupabaseClient | null | undefined

export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached

  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    cached = null
    return null
  }

  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  })
  return cached
}
