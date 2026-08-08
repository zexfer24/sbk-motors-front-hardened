import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { setSessionCookies } from "@/lib/supabase/session"
import { checkRateLimit, clientIp, resetRateLimit } from "@/lib/rate-limit"

// Login del sistema — sin registro, las cuentas se crean a mano con
// scripts/manage-users.mjs. Autentica contra Supabase Auth y devuelve la
// sesión como cookies httpOnly (ver lib/supabase/session.ts) en vez de
// dejar que el SDK la guarde en el navegador.
//
// Supabase Auth ya parametriza todo internamente (no arma SQL a mano con
// este input), así que la inyección SQL clásica no aplica — igual se
// valida la forma del email/contraseña acá, como defensa en profundidad,
// antes de que el input llegue siquiera al SDK.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_EMAIL_LENGTH = 254
const MAX_PASSWORD_LENGTH = 128

// Caracteres de control (incluye NUL) — no tienen razón de estar en un
// email o contraseña legítimos, se rechazan sin intentar interpretarlos.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/

// ============================================================================
// Techos de intentos fallidos.
// ============================================================================
// Esta es la ÚNICA barrera del sistema: se decidió no usar MFA, así que la
// contraseña es el único factor y este límite es lo que hace que probarlas
// salga caro. Se cuenta por IP y por correo a la vez, y en dos ventanas:
//
//   - ventana corta (15 min) → corta el ataque rápido y ruidoso
//   - ventana larga (24 h)   → corta el ataque lento ("slow drip"), que se
//                              queda justo por debajo del límite corto y
//                              acumula intentos durante días
//
// Basta que una de las cuatro se agote para rechazar.
const SHORT_WINDOW_MS = 15 * 60 * 1000
const LONG_WINDOW_MS = 24 * 60 * 60 * 1000

const MAX_PER_IP_SHORT = 20
const MAX_PER_IP_LONG = 60
const MAX_PER_EMAIL_SHORT = 5
const MAX_PER_EMAIL_LONG = 20

function tooManyAttempts(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "demasiados_intentos" },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  )
}

export async function POST(request: Request) {
  // El límite por IP se comprueba antes de leer el cuerpo: así una avalancha
  // de peticiones se corta lo antes posible.
  const ip = clientIp(request)
  for (const [limit, windowMs] of [
    [MAX_PER_IP_SHORT, SHORT_WINDOW_MS],
    [MAX_PER_IP_LONG, LONG_WINDOW_MS],
  ] as const) {
    const result = checkRateLimit(`login:ip:${windowMs}:${ip}`, limit, windowMs)
    if (!result.ok) {
      console.warn(`[auth] login bloqueado por IP ${ip} (ventana ${windowMs}ms)`)
      return tooManyAttempts(result.retryAfterSeconds)
    }
  }

  const body = await request.json().catch(() => null)
  const rawEmail = body && typeof body === "object" ? (body as Record<string, unknown>).email : null
  const password = body && typeof body === "object" ? (body as Record<string, unknown>).password : null

  if (typeof rawEmail !== "string" || typeof password !== "string" || !rawEmail.trim() || !password) {
    return NextResponse.json({ error: "credenciales_requeridas" }, { status: 400 })
  }

  const email = rawEmail.trim()

  if (email.length > MAX_EMAIL_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return NextResponse.json({ error: "credenciales_invalidas" }, { status: 400 })
  }
  if (!EMAIL_RE.test(email) || CONTROL_CHARS_RE.test(email) || CONTROL_CHARS_RE.test(password)) {
    return NextResponse.json({ error: "credenciales_invalidas" }, { status: 400 })
  }

  // En minúsculas: si no, alternar mayúsculas daría un contador nuevo por
  // cada variante del mismo correo.
  const emailKey = email.toLowerCase()
  const emailBuckets = [
    [`login:email:${SHORT_WINDOW_MS}:${emailKey}`, MAX_PER_EMAIL_SHORT] as const,
    [`login:email:${LONG_WINDOW_MS}:${emailKey}`, MAX_PER_EMAIL_LONG] as const,
  ]
  for (const [key, limit] of emailBuckets) {
    const windowMs = key.includes(String(LONG_WINDOW_MS)) ? LONG_WINDOW_MS : SHORT_WINDOW_MS
    const result = checkRateLimit(key, limit, windowMs)
    if (!result.ok) {
      console.warn(`[auth] login bloqueado para ${emailKey} desde ${ip}`)
      return tooManyAttempts(result.retryAfterSeconds)
    }
  }

  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: "autenticacion_no_configurada" }, { status: 503 })
  }

  const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } })
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data.session || !data.user) {
    // Se registra el fallo para que quede rastro en los logs de Dokploy: sin
    // MFA, una racha de estos es la única señal temprana de un ataque de
    // fuerza bruta. No se registra la contraseña, obviamente.
    console.warn(`[auth] intento fallido para ${emailKey} desde ${ip}`)
    return NextResponse.json({ error: "credenciales_invalidas" }, { status: 401 })
  }

  // Autenticación correcta: se limpian los contadores de este correo para que
  // los fallos previos por tecleo no acerquen al bloqueo. Los de la IP se
  // dejan a propósito: si una sola IP acierta una cuenta después de fallar
  // muchas, ese patrón sigue siendo interesante de limitar.
  for (const [key] of emailBuckets) resetRateLimit(key)

  const role = data.user.app_metadata?.role === "admin" ? "admin" : "asesor"
  const response = NextResponse.json({ user: { email: data.user.email, role } })
  setSessionCookies(response, data.session)
  return response
}
