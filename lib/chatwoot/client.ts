type ChatwootConfig = {
  baseUrl: string
  apiToken: string
  accountId: string
}

let cached: ChatwootConfig | null | undefined

export function getChatwootConfig(): ChatwootConfig | null {
  if (cached !== undefined) return cached

  const baseUrl = process.env.CHATWOOT_URL
  const apiToken = process.env.CHATWOOT_API_TOKEN
  const accountId = process.env.CHATWOOT_ACCOUNT_ID

  if (!baseUrl || !apiToken || !accountId) {
    cached = null
    return null
  }

  cached = {
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiToken,
    accountId,
  }
  return cached
}

let cachedAgentId: number | null | undefined

// El agente dueño del CHATWOOT_API_TOKEN — se usa para autoasignarse la
// conversación cuando un asesor pulsa "Intervenir".
export async function getChatwootAgentId(): Promise<number | null> {
  if (cachedAgentId !== undefined) return cachedAgentId

  const config = getChatwootConfig()
  if (!config) {
    cachedAgentId = null
    return null
  }

  try {
    const res = await fetch(`${config.baseUrl}/api/v1/profile`, {
      headers: { api_access_token: config.apiToken },
    })
    if (!res.ok) {
      cachedAgentId = null
      return null
    }
    const data = await res.json()
    cachedAgentId = typeof data.id === "number" ? data.id : null
  } catch {
    cachedAgentId = null
  }

  return cachedAgentId ?? null
}

let cachedAgentNames: Map<number, string> | undefined

// Nombre real (el que tiene configurado en su perfil de Chatwoot) de un
// agente por su id — para poder mostrar "quién de nosotros" mandó un
// mensaje en vez de siempre el dueño del token compartido (ver
// content_attributes.sent_by_name en app/api/chatwoot/conversations/[id]/messages/route.ts,
// que es donde se usa esto). Cachea la lista completa por proceso, mismo
// criterio que getChatwootAgentId — un agente nuevo vinculado no aparece
// hasta el próximo reinicio, aceptable para esto.
export async function getChatwootAgentName(agentId: number): Promise<string | null> {
  if (!cachedAgentNames) {
    const config = getChatwootConfig()
    if (!config) return null

    try {
      const agents = await fetch(`${config.baseUrl}/api/v1/accounts/${config.accountId}/agents`, {
        headers: { api_access_token: config.apiToken },
      }).then((res) => (res.ok ? res.json() : []))
      cachedAgentNames = new Map(
        (Array.isArray(agents) ? agents : [])
          .filter((a: unknown): a is { id: number; name: string } => {
            const rec = a as Record<string, unknown>
            return typeof rec?.id === "number" && typeof rec?.name === "string"
          })
          .map((a) => [a.id, a.name]),
      )
    } catch {
      return null
    }
  }

  return cachedAgentNames.get(agentId) ?? null
}

// `path` se concatena a la URL de la API sin codificar, así que un segmento
// dinámico con `..` (o su forma percent-encoded, que Next.js decodifica en
// los parámetros de ruta) podía desviar la petición a otro endpoint de la
// API de Chatwoot, autenticada con nuestro token.
//
// El arreglo principal está en las rutas: ahora validan que el `id` sea
// numérico antes de llegar aquí (ver lib/chatwoot/authz.ts). Esta es la
// segunda barrera, para que un `path` mal construido en el futuro falle
// ruidosamente en vez de convertirse otra vez en un traversal silencioso.
function assertSafePath(path: string): void {
  if (!path.startsWith("/")) {
    throw new Error(`Chatwoot: path debe empezar por "/": ${path}`)
  }
  const decoded = (() => {
    try {
      return decodeURIComponent(path)
    } catch {
      return path
    }
  })()
  if (decoded.includes("..") || decoded.includes("//") || /[\\\r\n]/.test(decoded)) {
    throw new Error("Chatwoot: path con traversal o caracteres no permitidos")
  }
}

// Sin esto, un Chatwoot que se cuelga (un worker de Puma atascado, un
// hipo de red dentro de la red docker) deja la petición esperando sin
// límite — `fetch` de Node no tiene timeout por defecto. Eso es lo único
// que explica cargas de "hasta 10 minutos": ninguna optimización de
// paginación o caché pone techo al tiempo de UNA sola petición que se
// cuelga, solo reducen cuántas se hacen. Con esto, en el peor caso la
// petición falla rápido y el front puede mostrar un error en vez de
// quedarse con la pantalla en blanco indefinidamente.
const CHATWOOT_TIMEOUT_MS = 10_000
const CHATWOOT_UPLOAD_TIMEOUT_MS = 30_000 // los adjuntos pueden tardar más, dependen del tamaño del archivo

export async function chatwootFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const config = getChatwootConfig()
  if (!config) throw new Error("Chatwoot no configurado")

  assertSafePath(path)
  const url = `${config.baseUrl}/api/v1/accounts/${config.accountId}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      api_access_token: config.apiToken,
      ...options.headers,
    },
    signal: options.signal ?? AbortSignal.timeout(CHATWOOT_TIMEOUT_MS),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Chatwoot error ${res.status}: ${body}`)
  }

  // Algunos endpoints (p. ej. el DELETE de mensajes) responden 200 con el
  // cuerpo vacío — sin esto, res.json() tira "Unexpected end of JSON input"
  // sobre una llamada que en realidad SÍ tuvo éxito.
  const text = await res.text()
  return (text ? JSON.parse(text) : {}) as T
}

// Para endpoints que reciben archivos (p. ej. mensajes con adjuntos) —
// nunca fijar Content-Type a mano con FormData, fetch arma el boundary
// multipart correcto solo si se lo dejamos.
export async function chatwootFetchForm<T>(path: string, formData: FormData): Promise<T> {
  const config = getChatwootConfig()
  if (!config) throw new Error("Chatwoot no configurado")

  assertSafePath(path)
  const url = `${config.baseUrl}/api/v1/accounts/${config.accountId}${path}`
  const res = await fetch(url, {
    method: "POST",
    headers: { api_access_token: config.apiToken },
    body: formData,
    signal: AbortSignal.timeout(CHATWOOT_UPLOAD_TIMEOUT_MS),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Chatwoot error ${res.status}: ${body}`)
  }

  return res.json()
}
