import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { ACCESS_COOKIE, REFRESH_COOKIE, setSessionCookies } from "@/lib/supabase/session"
import { CHATWOOT_AGENT_ID_HEADER, USER_EMAIL_HEADER, USER_ROLE_HEADER } from "@/lib/auth-headers"

type Role = "admin" | "asesor"

// Único punto que decide "¿quién eres y qué puedes ver?" para todo el
// sistema — corre antes de cualquier página o ruta /api/*.
//
// Solo dos roles: "admin" (dueños/supervisor, ven todo) y "asesor" (solo
// Chats, Clientes e Inventario — Panel y Ventas quedan ocultos y sus
// endpoints devuelven 403 aunque alguien intente pegarle directo a la
// API). El rol vive en `app_metadata` de Supabase Auth (ver
// scripts/manage-users.mjs), no en una tabla aparte.

// /api/chatwoot/webhook también es pública: la llama Chatwoot, no un
// navegador con sesión — se protege con su propio secreto (?token=...),
// ver ese route.ts.
const PUBLIC_API_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/chatwoot/webhook",
])

// ============================================================================
// CSP por nonce
// ============================================================================
// Va aquí y no en next.config.mjs porque el nonce tiene que ser distinto en
// cada petición: un valor fijo no aporta nada. Se genera uno, se pone en la
// cabecera CSP y se propaga a la petición — Next.js lee esa cabecera y le
// añade el nonce a sus propios <script> de hidratación automáticamente.
//
// Esto es lo que permite quitar 'unsafe-inline' de script-src, que era la
// parte floja de la versión anterior: con 'unsafe-inline' el navegador
// ejecuta cualquier script incrustado en el HTML, que es justo lo que
// inyectaría un XSS. Ahora solo ejecuta los que llevan el nonce del momento,
// y un atacante no puede adivinarlo.
//
// 'strict-dynamic': los scripts cargados POR un script ya confiado (así carga
// Next sus chunks) heredan la confianza. Sin esto habría que enumerar cada
// archivo generado por el build.
//
// style-src conserva 'unsafe-inline': Next y Tailwind inyectan estilos
// incrustados y no admiten nonce ahí. El riesgo de un estilo inyectado es
// mucho menor que el de un script (no ejecuta código).
function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV !== "production"

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    // En desarrollo Next necesita eval para el refresco en caliente.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${isDev ? "'unsafe-eval'" : ""}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    // Chatwoot sirve los adjuntos y avatares desde su propio dominio.
    "img-src 'self' data: blob: https:",
    "media-src 'self' https:",
    // next/font descarga las fuentes en el build y las sirve desde el propio
    // origen, así que no hace falta permitir Google Fonts.
    "font-src 'self' data:",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ")
}

function applyCsp(response: NextResponse, csp: string): NextResponse {
  response.headers.set("Content-Security-Policy", csp)
  return response
}

function isAdminOnlyApi(pathname: string, method: string): boolean {
  if (pathname.startsWith("/api/dashboard")) return true
  if (pathname === "/api/orders" && method === "GET") return true
  // /api/orders/:id (PATCH de Confirmar/Devolución) — admin solo. El POST a
  // /api/orders (crear la venta) NO cae acá, lo necesitan los asesores para
  // cerrar ventas desde el chat.
  if (/^\/api\/orders\/[^/]+$/.test(pathname)) return true
  // Respuestas rápidas: cualquier asesor autenticado las puede LEER (las
  // usa en el chat), pero crear/editar/borrar es admin-only — son
  // contenido compartido por toda la empresa.
  if (pathname === "/api/quick-replies" && method !== "GET") return true
  if (/^\/api\/quick-replies\/[^/]+$/.test(pathname)) return true
  // Asignar un chat a otro asesor y ver la lista de asesores son acciones
  // de supervisor — el asesor común solo puede "tomar" un chat vía
  // /intervene (con su propia regla, ver ese route.ts).
  if (/^\/api\/chatwoot\/conversations\/[^/]+\/assign$/.test(pathname)) return true
  if (pathname === "/api/agents") return true
  // Categorías (labels): cualquiera puede leer el catálogo, aplicar/quitar
  // etiquetas de una conversación, y ahora también CREAR y EDITAR el
  // catálogo (título/color) — a diferencia de quick-replies, esto lo pidió
  // el negocio explícitamente abierto a todo el equipo. Solo BORRAR sigue
  // admin-only: es lo único que afecta a cualquier chat que ya tenga esa
  // etiqueta puesta, no solo a quien la crea.
  if (/^\/api\/chatwoot\/labels\/[^/]+$/.test(pathname) && method === "DELETE") return true
  return false
}

interface ResolvedSession {
  role: Role
  email: string
  chatwootAgentId: number | null
  refreshedCookies?: { accessToken: string; refreshToken: string; expiresIn: number }
}

function roleOf(appMetadata: Record<string, unknown> | null | undefined): Role {
  return appMetadata?.role === "admin" ? "admin" : "asesor"
}

function chatwootAgentIdOf(appMetadata: Record<string, unknown> | null | undefined): number | null {
  const value = appMetadata?.chatwoot_agent_id
  return typeof value === "number" && Number.isInteger(value) ? value : null
}

async function resolveSession(request: NextRequest): Promise<ResolvedSession | null> {
  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  // Sin Supabase configurado no hay forma de autenticar a nadie — se niega
  // el acceso (falla cerrado) en vez de dejar pasar como admin. Una
  // variable de entorno faltante en producción nunca debe traducirse en
  // "cualquiera entra sin login".
  if (!url || !serviceRoleKey) return null

  const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } })

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value
  if (accessToken) {
    const { data, error } = await supabase.auth.getUser(accessToken)
    if (!error && data.user) {
      return {
        role: roleOf(data.user.app_metadata),
        email: data.user.email ?? "",
        chatwootAgentId: chatwootAgentIdOf(data.user.app_metadata),
      }
    }
  }

  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value
  if (refreshToken) {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken })
    if (!error && data.session && data.user) {
      return {
        role: roleOf(data.user.app_metadata),
        email: data.user.email ?? "",
        chatwootAgentId: chatwootAgentIdOf(data.user.app_metadata),
        refreshedCookies: {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
          expiresIn: data.session.expires_in ?? 3600,
        },
      }
    }
  }

  return null
}

function applyRefreshedCookies(response: NextResponse, resolved: ResolvedSession) {
  if (!resolved.refreshedCookies) return
  setSessionCookies(response, {
    access_token: resolved.refreshedCookies.accessToken,
    refresh_token: resolved.refreshedCookies.refreshToken,
    expires_in: resolved.refreshedCookies.expiresIn,
  })
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Un nonce nuevo por petición. Se propaga a la petición en la propia
  // cabecera CSP para que Next.js lo lea y se lo ponga a sus scripts.
  const nonce = crypto.randomUUID().replace(/-/g, "")
  const csp = buildCsp(nonce)

  const cspRequestHeaders = new Headers(request.headers)
  cspRequestHeaders.set("Content-Security-Policy", csp)

  if (pathname === "/login") {
    const resolved = await resolveSession(request)
    if (resolved) {
      const response = NextResponse.redirect(new URL("/", request.url))
      applyRefreshedCookies(response, resolved)
      return response
    }
    // La pantalla de login también es HTML y también necesita la CSP.
    return applyCsp(NextResponse.next({ request: { headers: cspRequestHeaders } }), csp)
  }

  if (PUBLIC_API_PATHS.has(pathname)) {
    return NextResponse.next()
  }

  const resolved = await resolveSession(request)
  const isApi = pathname.startsWith("/api/")

  if (!resolved) {
    if (isApi) return NextResponse.json({ error: "no_autenticado" }, { status: 401 })
    const loginUrl = new URL("/login", request.url)
    return NextResponse.redirect(loginUrl)
  }

  if (isApi && resolved.role !== "admin" && isAdminOnlyApi(pathname, request.method)) {
    return NextResponse.json({ error: "sin_permiso" }, { status: 403 })
  }

  // `new Headers(request.headers)` copia los headers QUE MANDÓ EL CLIENTE.
  // Los tres headers de identidad se borran primero, siempre: si solo se
  // sobrescribieran, cualquier rama que no ejecute `set()` dejaría pasar el
  // valor del cliente intacto. Era exactamente el caso de
  // x-chatwoot-agent-id cuando el usuario no tenía agente vinculado — se
  // podía enviar a mano y suplantar a otro asesor en /intervene.
  const requestHeaders = new Headers(cspRequestHeaders)
  requestHeaders.delete(USER_ROLE_HEADER)
  requestHeaders.delete(USER_EMAIL_HEADER)
  requestHeaders.delete(CHATWOOT_AGENT_ID_HEADER)

  requestHeaders.set(USER_ROLE_HEADER, resolved.role)
  requestHeaders.set(USER_EMAIL_HEADER, resolved.email)
  if (resolved.chatwootAgentId !== null) {
    requestHeaders.set(CHATWOOT_AGENT_ID_HEADER, String(resolved.chatwootAgentId))
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  applyRefreshedCookies(response, resolved)
  return applyCsp(response, csp)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sbk-logo.png|placeholder-logo.svg).*)"],
}
