# Versión endurecida — capa Next.js / API

Derivada de `final_sbk_front` el **2026-08-08**, a partir de la auditoría en
`../_auditoria_seguridad/FASE1-informe-2026-08-08.md`.

El repo original **no se modificó**. Esta carpeta se creó con `git archive`, así
que contiene solo los 116 archivos versionados.

## ⚠️ Antes de arrancar: falta `.env.local`

**No se copió a propósito.** El informe (Hallazgo 13) señala que duplicar la
`service_role` key por el disco es parte del problema; no iba a crear una copia
más. Cópialo tú:

```bash
cp "../final_sbk_front/.env.local" .env.local
```

Sin ese archivo la app arranca en modo demo y **`/api/*` responde 401** — que es
el comportamiento correcto: la autenticación falla cerrada.

---

## Verificaciones ejecutadas

| Comprobación | Resultado |
|---|---|
| `pnpm audit --prod` | **0 vulnerabilidades** (antes: 34, de ellas 16 high) |
| `pnpm audit` (incl. dev) | 1 moderate (antes: 34) |
| `npx tsc --noEmit` | 0 errores |
| `pnpm test` | 17/17 pasan |
| `pnpm build` | correcto, 19 rutas |
| `pnpm lint` | 71 problemas — **idéntico al original**, 0 introducidos por estos cambios |
| Cabeceras HTTP | verificadas en ejecución con `curl` |
| Rate limiting | verificado: 5 intentos pasan, el 6º devuelve 429 + `Retry-After: 889` |
| **CSP por nonce** | **verificada en navegador real**: app hidrata, login envía `POST /api/auth/login`, React renderiza la respuesta, cero violaciones |

### Por qué la verificación en navegador no era opcional

El primer intento de CSP estricta **rompía la aplicación por completo**, y ni el
build ni el typecheck ni los tests lo detectaron: los tres pasaban en verde.

La causa: `/` y `/login` se prerenderizaban en el build (`○ Static`), así que su
HTML se generaba **antes** de que existiera el nonce de la petición. Sus
`<script>` salían sin nonce y el navegador los bloqueaba todos. La página se
veía bien —el HTML del servidor renderiza— pero no hidrataba: el formulario de
login no hacía absolutamente nada, cero peticiones de red.

Se arregló con `export const dynamic = 'force-dynamic'` en `app/layout.tsx`.
Tras el cambio las rutas pasan a `ƒ Dynamic`, los scripts llevan nonce y el
formulario funciona. No se pierde nada: el panel está detrás de login y todos
sus datos son dinámicos, no había prerender aprovechable.

**Si tocas la CSP, vuelve a probar en navegador.** Compilar no prueba nada aquí.

Los 64 errores de lint son **preexistentes**: la config de ESLint no declara
los globales de Node (`console`, `process`) para `scripts/*.mjs`. No es de
seguridad y se deja como estaba para no mezclar cambios.

---

## Hallazgos resueltos

### ALTO

**3 — IDOR en las rutas por ID.** Nuevo `lib/chatwoot/authz.ts`.
`authorizeConversation()` consulta a quién está asignada la conversación en
Chatwoot y aplica: admin → todo; asesor → sus chats y los no asignados; nadie
más. Aplicado en las 5 rutas (`messages` GET y POST, `close`, `read`,
`intervene`) y también en `POST /api/orders`, que colgaba de un
`conversationId` sin comprobar.

**4 — Filtrado que fallaba abierto.** La condición era
`role === "asesor" && agentId !== null`, así que un asesor sin
`chatwoot_agent_id` caía al `else` y veía todas las conversaciones. Ahora solo
se ensancha la vista para `admin`; cualquier otro caso filtra.

**5 — Suplantación por header.** `proxy.ts` copia los headers del cliente con
`new Headers(request.headers)` y solo sobrescribía `x-chatwoot-agent-id`
cuando el usuario tenía agente vinculado. Ahora los tres headers de identidad
se **borran siempre** antes de fijarse.

**6 — Login sin límite de intentos.** Nuevo `lib/rate-limit.ts`. Se decidió
**no implementar MFA**, así que la contraseña es el único factor y este límite
es toda la barrera: se reforzó en consecuencia.

Cuatro contadores simultáneos, en dos ventanas — basta que uno se agote:

| Clave | 15 min | 24 h |
|---|---|---|
| por IP | 20 | 60 |
| por correo | 5 | 20 |

La ventana de 24 h existe para el ataque lento ("slow drip"), que se queda
justo por debajo del límite corto y acumula intentos durante días. El correo se
normaliza a minúsculas para que alternar mayúsculas no cree un contador nuevo.
Al autenticarse bien se limpian los contadores de ese correo, para que quien se
equivocó tecleando no quede a un intento del bloqueo.

Además, refuerzos del login al no haber MFA:

- **Cada intento fallido se registra** (`console.warn` con correo e IP, nunca
  la contraseña). Sin MFA, una racha de fallos en los logs de Dokploy es la
  única señal temprana de un ataque. Los bloqueos por 429 también se registran.
- **Cookies `sameSite: "strict"`** (antes `"lax"`): el navegador no manda la
  cookie de sesión en ninguna navegación originada en otro sitio, lo que cierra
  la clase entera de CSRF. Viable justamente porque nadie entra al panel desde
  enlaces externos. Único efecto visible: quien llegue desde un enlace pegado
  en WhatsApp verá el login una vez.
- **Sesión de 30 días → 7 días.** Un mes solo alargaba la ventana en la que un
  refresh token robado sigue sirviendo; el personal entra a diario.

> **Limitación:** el contador vive en memoria del proceso. Con una instancia
> (el caso actual) funciona; con varias réplicas cada una tendría el suyo y el
> límite efectivo se multiplicaría. Ahí hay que moverlo al Redis que ya
> existe en la infraestructura.

**7 — Dependencias.** `next` 16.2.6 → `^16.2.11` (resuelto 16.3.0). `postcss`
→ `^8.5.18`. Overrides de `undici`, `brace-expansion`, `nanoid`, `js-yaml`,
`fast-uri`, `ip-address`, `hono`.

> Los overrides estaban en el campo `pnpm` de `package.json`, que **pnpm v11
> ya no lee** — los ignoraba con un warning. Estaban fijando `hono: 4.12.25`,
> una versión vulnerable, y encima sin efecto. Se movieron a
> `pnpm-workspace.yaml`, que es donde ahora se leen.

### MEDIO

**8 — Path traversal hacia Chatwoot.** Los `id` se validan como numéricos
(`/^[0-9]{1,18}$/`) antes de interpolarse. Segunda barrera en
`lib/chatwoot/client.ts`: `assertSafePath()` rechaza `..`, `//`, barras
invertidas y saltos de línea, también en su forma percent-encoded.

**9 — Logout que no revocaba nada.** Ahora llama a
`supabase.auth.admin.signOut(token, "global")` antes de borrar las cookies. Si
esa llamada falla, las cookies se borran igual.

**10 — Fuga de `error.message`.** Nuevo `lib/api-errors.ts` con
`serverError()`: el detalle va al log del servidor, al cliente solo el código.
Aplicado en los 7 sitios. Verificado: cero `detail:` en `app/`.

**11 — Cabeceras de seguridad.** `next.config.mjs` sirve HSTS (2 años,
`includeSubDomains`, `preload`), `X-Frame-Options: DENY`, `nosniff`,
`Referrer-Policy`, `Permissions-Policy` y COOP; más `Cache-Control: no-store`
en todo `/api/*`.

**CSP estricta por nonce**, en `proxy.ts` (no en `next.config.mjs`, porque el
nonce cambia en cada petición y un valor fijo en la configuración no podría
generarlo — definirla en los dos sitios enviaría dos cabeceras y el navegador
aplicaría la intersección, que rompe la app de forma difícil de diagnosticar).

`script-src` es `'self' 'nonce-<aleatorio>' 'strict-dynamic'` — **sin
`'unsafe-inline'`**. Es la diferencia importante: con `'unsafe-inline'` el
navegador ejecuta cualquier script incrustado en el HTML, que es justo lo que
inyecta un XSS. Ahora solo ejecuta los que llevan el nonce de esa petición, y
un atacante no puede adivinarlo. `'strict-dynamic'` permite que los chunks que
carga Next hereden la confianza sin enumerar cada archivo del build.

`style-src` conserva `'unsafe-inline'`: Next y Tailwind inyectan estilos
incrustados y no admiten nonce ahí. Un estilo inyectado no ejecuta código, así
que el riesgo es de otro orden.

**`@vercel/analytics` eliminado** (dependencia y `app/layout.tsx`). Cargaba un
script desde `va.vercel-scripts.com` que no hace nada fuera de Vercel — y esto
se autohospeda en Contabo con Dokploy. Quitarlo elimina un script de terceros
en producción y permitió cerrar `script-src` y `connect-src` a `'self'` sin
excepciones.

**12 — `shadcn` en producción.** Movido a `devDependencies`. Es una CLI de
desarrollo y arrastraba `@modelcontextprotocol/sdk` → `hono` al árbol de
producción. Este cambio es el que más pesa en el `audit --prod` limpio.

**14 — Atribución de ventas.** `advisorName` ya no se acepta del cliente: se
deriva del asignado en Chatwoot, que es de donde lo leía el front
(`conversation.assigneeName`). **El valor mostrado en Ventas no cambia.**

### BAJO

**15 — Inyección de filtros PostgREST.** El `?q=` de inventario descarta ahora
comas, paréntesis, puntos, comillas y dos puntos antes de construir el `or()`.

**1 (parcial) — `.dockerignore`.** Añadidos `credentials*.txt`, `*.pem`,
`*.key`, `secrets*`, para que el `COPY . .` del `Dockerfile` no vuelva a meter
un archivo de credenciales en la capa `builder`.

**2 (residual) — RLS como código.** Nuevo `db/rls_policies.sql`: documenta e
idempotentemente reproduce el estado verificado (RLS activo en las 6 tablas,
una sola política). Antes esto solo vivía en el estado de la instancia, así que
un entorno reconstruido desde `db/*.sql` arrancaba sin RLS.

---

## NO resuelto — sigue pendiente

Esto **no** está arreglado aquí, y por eso esta carpeta no equivale a "sistema
listo para producción":

1. **MFA — decisión tomada: no se implementa.** El razonamiento del propietario
   es que solo entran asesores y administradores, y que nadie tiene el enlace
   del dominio.

   Conviene ser explícito en un punto: **"nadie tiene el enlace" no es un
   control de seguridad.** Un dominio se descubre por certificados TLS
   (Certificate Transparency es público y registra cada certificado emitido),
   por DNS pasivo, por el `Referer` de cualquier petición saliente, o porque un
   asesor comparte el enlace. La protección real del login es lo que se
   reforzó arriba, no el desconocimiento de la URL.

   Consecuencia asumida: **una contraseña sigue siendo el único factor para
   entrar, incluidos los 3 admin**, y esas contraseñas están en texto plano en
   `../_credenciales/` sin rotar. Si algún día se reconsidera, Supabase Auth
   soporta TOTP de forma nativa y solo faltarían las dos pantallas.
2. **Rotación de contraseñas.** Decidiste no rotar. El archivo en claro está
   en `../_credenciales/`.
3. **Capa `builder` de Docker ya construida.** Si la imagen se construyó en el
   VPS antes del 2026-08-08, ese archivo sigue en la caché de build.
   `docker builder prune` en el VPS lo limpia.
4. **Rate limiting distribuido.** Ver Hallazgo 6 arriba. Solo hace falta si se
   corre más de una instancia del panel.
5. **`style-src 'unsafe-inline'`.** Ver Hallazgo 11 arriba.
6. **Toda la infraestructura.** n8n (incluido su webhook público), Chatwoot,
   Redis, docker-compose, SSH, fail2ban, backups y monitoreo **nunca se
   auditaron** — no hay acceso al VPS desde el entorno de desarrollo.
7. **Hallazgo 20 — dispersión de `service_role`.** n8n y la API externa que
   alimenta `saprod` usan credenciales que bypassan RLS; no está verificado
   cuáles. Mientras siga así, RLS no protege frente a esos componentes.

## Estado de despliegue — comprobado el 2026-08-08, incluida la imagen Docker real

| Comprobación | Estado |
|---|---|
| Build desde cero (`rm -rf .next && pnpm build`) | ✅ correcto |
| `pnpm install --frozen-lockfile` (lo que corre el Dockerfile) | ✅ lockfile sincronizado |
| `.next/standalone/server.js` generado (22 MB) | ✅ |
| Scripts con nonce / sin nonce en HTML servido | ✅ 15 / **0** |
| Login funcional en navegador sobre build limpio | ✅ `POST /api/auth/login` dispara |
| Secretos en la carpeta | ✅ ninguno (solo `.env.example`) |
| `Dockerfile` copia `pnpm-workspace.yaml` (los overrides viven ahí) | ✅ |
| **`docker build` con el build arg correcto** | ✅ **imagen construida sin errores** |
| **`docker build` SIN el build arg** | ✅ **falla explícitamente**, como se diseñó |
| **Contenedor real, con `.env.local` de producción, puerto expuesto** | ✅ arranca, `Ready in 0ms` |
| **CSP y HSTS servidas desde el contenedor** | ✅ verificadas con `curl -I` |
| **IDOR — ataque real contra Chatwoot/Supabase de producción** | ✅ **ver abajo** |
| **Repositorio git** | ⚠️ **no es repo** — `git archive` extrae archivos, no `.git` |

### Prueba de penetración real, contra el contenedor y tus datos de producción

No fue una prueba de humo. Se construyó la imagen con `docker build`, se corrió
el contenedor con las credenciales reales de `.env.local` (Supabase, Chatwoot),
y se atacó desde fuera con `curl`, usando sesiones reales de `asesor1` y del
supervisor (`Jose Riera`, admin) — las mismas cuentas de producción.

1. Con la sesión de admin, se tomó una conversación real (`/intervene`) para
   que quedara asignada a un agente distinto de `asesor1`.
2. Con la sesión de `asesor1`, se intentaron las 5 rutas que antes eran
   vulnerables, contra esa conversación ajena:

   | Ruta | Antes del fix | Ahora |
   |---|---|---|
   | `GET .../messages` (leer el chat) | 200, historial completo | **403** |
   | `POST .../messages` (escribir al cliente) | 200 | **403** |
   | `POST .../close` | 200 | **403** |
   | `POST .../read` | 200 | **403** |
   | `POST .../intervene` (robar el chat) | 200 | **403** |

3. El listado de `asesor1` ya no mostraba esa conversación en absoluto (antes
   sí la habría mostrado, dado que el filtrado fallaba abierto).
4. Un `id` con path traversal (`1%2F..%2Fprofile`) devolvió **400** antes de
   llegar a construir la URL hacia Chatwoot.
5. Los logs del contenedor registraron los intentos fallidos de login con
   correo e IP — **nunca la contraseña** — confirmando que el logging de
   Hallazgo 6 funciona en el contenedor real, no solo en desarrollo.

Se restauró el estado original de la conversación (`intervene:false`) al
terminar, y se destruyeron el contenedor, las imágenes de prueba y los archivos
temporales con las cookies de sesión. El repositorio original quedó intacto
(verificado con `git status`).

### Variables a declarar en Dokploy

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
CHATWOOT_URL
CHATWOOT_API_TOKEN
CHATWOOT_ACCOUNT_ID
CHATWOOT_PLATFORM_TOKEN
NEXT_PUBLIC_APP_URL        ← además como BUILD ARG (ver abajo)
```

### ⚠️ `NEXT_PUBLIC_APP_URL` debe ser build arg, no solo variable de runtime

Next.js **incrusta las variables `NEXT_PUBLIC_*` en el bundle del cliente
durante la compilación**. `lib/hooks/use-dashboard.ts`,
`lib/hooks/use-exchange-rate.ts` y `lib/api/*.ts` la leen desde el navegador,
con `?? "http://localhost:3000"` como valor por defecto.

Si Dokploy solo la inyecta en runtime, el bundle sale con `undefined` y el
panel desplegado intentaría llamar a la API en **la máquina del usuario**. La
app arrancaría y compilaría sin un solo error, y luego no funcionaría nada.

El `Dockerfile` ahora **falla el build de forma explícita** si el build arg
falta, en vez de hornear `localhost` en silencio. Declárala en Dokploy como
argumento de construcción:

```
NEXT_PUBLIC_APP_URL=https://tu-dominio-del-panel
```

## Antes de despachar a Dokploy

- **`sameSite: "strict"` invalidará las sesiones abiertas.** Todo el mundo
  tendrá que volver a entrar una vez. Es esperado.
- **Las cookies exigen HTTPS en producción** (`secure` se activa con
  `NODE_ENV=production`). Dokploy debe servir el dominio por HTTPS o nadie
  podrá iniciar sesión.
- **HSTS con `preload` es difícil de revertir**: obliga a HTTPS durante 2 años
  en los navegadores que ya la recibieron. Solo despliega si el dominio va a
  seguir siendo HTTPS.
- **Comprueba `x-forwarded-for`.** El rate limiting por IP lee esa cabecera; si
  el proxy de Dokploy no la fija, todas las peticiones parecerán venir de la
  misma IP y el límite por IP se aplicaría a todo el mundo en bloque. El límite
  por correo sigue funcionando en cualquier caso.
- **Verifica el login en el navegador tras el primer despliegue**, con la
  consola abierta. La CSP es lo único aquí que puede romper la app entera y
  pasar todos los tests en verde.

## Y una limitación del método

Los hallazgos 3, 4 y 5 se identificaron **leyendo el código**, y las
correcciones se validaron con typecheck, tests, build y las pruebas de
cabeceras y rate limiting de arriba. **No se ejecutó un pentest dinámico
autenticado** que confirme el IDOR original ni su cierre contra Chatwoot real.
Antes de desplegar conviene probar a mano, con dos cuentas de asesor distintas,
que uno no alcanza las conversaciones del otro.
