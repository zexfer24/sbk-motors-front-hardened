// ============================================================================
// Cookies de sesión — SOLO de servidor (middleware + rutas /api/auth/*).
// ============================================================================
// El login usa Supabase Auth (email/password), pero en vez de dejar que el
// SDK de Supabase maneje la sesión en el navegador, el access/refresh token
// se guardan como cookies httpOnly propias. Así todo el acceso a Supabase
// sigue pasando solo por el servidor (mismo patrón que el resto del
// proyecto, ver lib/supabase/client.ts) y el token nunca es alcanzable
// desde JavaScript del cliente.
// ============================================================================

import type { NextResponse } from "next/server"

export const ACCESS_COOKIE = "sb-access-token"
export const REFRESH_COOKIE = "sb-refresh-token"

// Antes eran 30 días. Este es un panel interno que el personal usa a diario,
// así que una sesión de un mes solo alarga la ventana en la que un refresh
// token robado sigue sirviendo. Una semana cubre el uso normal (incluidas
// vacaciones cortas) sin dejar la puerta abierta un mes.
const SEVEN_DAYS = 60 * 60 * 24 * 7

interface SessionTokens {
  access_token: string
  refresh_token?: string | null
  expires_in?: number | null
}

export function setSessionCookies(response: NextResponse, session: SessionTokens) {
  const secure = process.env.NODE_ENV === "production"

  // sameSite "strict" en vez de "lax": el navegador no manda la cookie en
  // NINGUNA navegación que venga de otro sitio. Cierra la clase entera de
  // CSRF sin depender de tokens aparte.
  //
  // Con "lax" se enviaba en navegaciones de nivel superior desde fuera —
  // necesario si quisieras que un enlace externo llegara ya con sesión. Aquí
  // no aplica: nadie entra al panel desde enlaces externos, es una
  // herramienta interna. El único efecto visible es que si alguien llega
  // desde un enlace pegado en WhatsApp verá el login una vez y entrará
  // normal al navegar dentro.
  const cookieOptions = {
    httpOnly: true,
    secure,
    sameSite: "strict" as const,
    path: "/",
  }

  response.cookies.set(ACCESS_COOKIE, session.access_token, {
    ...cookieOptions,
    maxAge: session.expires_in ?? 3600,
  })

  if (session.refresh_token) {
    response.cookies.set(REFRESH_COOKIE, session.refresh_token, {
      ...cookieOptions,
      maxAge: SEVEN_DAYS,
    })
  }
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.delete(ACCESS_COOKIE)
  response.cookies.delete(REFRESH_COOKIE)
}
