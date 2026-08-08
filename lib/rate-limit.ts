// ============================================================================
// Rate limiting en memoria — para /api/auth/login.
// ============================================================================
// El sistema tiene 7 cuentas con direcciones predecibles
// (asesorN@…, nombre@…) y no hay MFA. Sin límite de intentos, probar
// contraseñas sale gratis. Esto pone un techo.
//
// Se limita por DOS claves a la vez:
//   - por IP     → frena a un atacante que prueba muchas cuentas
//   - por correo → frena a uno que rota IPs contra una sola cuenta
// Basta que una de las dos se agote para rechazar.
//
// LIMITACIÓN CONOCIDA: el estado vive en memoria del proceso. Con una sola
// instancia (el caso actual: un contenedor, `output: standalone`) funciona.
// Si algún día se escala a varias réplicas, cada una tendría su propio
// contador y el límite efectivo se multiplicaría — ahí hay que moverlo a
// Redis, que ya existe en la infraestructura.
// ============================================================================

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

// Techo de entradas para que un atacante que rota IPs no haga crecer el
// mapa sin límite (el propio rate limiter no debe ser un vector de DoS).
const MAX_ENTRIES = 10_000

function prune(now: number) {
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key)
  }
  // Si tras limpiar los caducados sigue lleno, se vacía por completo: es
  // preferible perder los contadores a crecer sin techo.
  if (buckets.size > MAX_ENTRIES) buckets.clear()
}

export interface RateLimitResult {
  ok: boolean
  retryAfterSeconds: number
}

// Al autenticarse correctamente se borra el contador: quien se equivocó
// tecleando cuatro veces y luego entró bien no debe quedarse a un intento del
// bloqueo. Solo los fallos acumulan.
export function resetRateLimit(key: string): void {
  buckets.delete(key)
}

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()

  if (buckets.size > MAX_ENTRIES) prune(now)

  const bucket = buckets.get(key)

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfterSeconds: 0 }
  }

  bucket.count += 1

  if (bucket.count > limit) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) }
  }

  return { ok: true, retryAfterSeconds: 0 }
}

// La IP real la pone el reverse proxy en x-forwarded-for. Si ese proxy no
// la sobrescribe, un cliente podría falsearla — por eso el límite por
// correo existe además de este, y no en su lugar.
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  return request.headers.get("x-real-ip")?.trim() || "desconocida"
}
