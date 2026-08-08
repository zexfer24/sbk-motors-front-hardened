import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@supabase/supabase-js"
import { ACCESS_COOKIE, clearSessionCookies } from "@/lib/supabase/session"

// Antes esta ruta solo borraba las cookies del navegador. El refresh token
// seguía siendo válido en Supabase durante 30 días (ver el maxAge en
// lib/supabase/session.ts), así que un token capturado antes del logout
// seguía canjeándose por access tokens nuevos DESPUÉS de "cerrar sesión":
// proxy.ts lo aceptaba y reemitía cookies frescas. Cerrar sesión no cerraba
// nada del lado del servidor.
//
// Ahora se revoca la sesión en Supabase primero. Si esa llamada falla, las
// cookies se borran igual — el logout local nunca debe quedarse a medias.

export async function POST() {
  const response = NextResponse.json({ ok: true })

  try {
    const cookieStore = await cookies()
    const accessToken = cookieStore.get(ACCESS_COOKIE)?.value
    const url = process.env.SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (accessToken && url && serviceRoleKey) {
      const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } })
      // scope "global": invalida todos los refresh tokens del usuario, no
      // solo el de esta pestaña.
      await supabase.auth.admin.signOut(accessToken, "global")
    }
  } catch (err) {
    console.error(`[api] logout: no se pudo revocar la sesión en Supabase: ${String(err)}`)
  }

  clearSessionCookies(response)
  return response
}
