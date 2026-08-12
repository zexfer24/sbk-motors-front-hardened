// ============================================================================
// Puente compartido entre /api/chatwoot/conversations y /api/contacts.
// Ambas rutas necesitan la misma respuesta de Chatwoot: la primera para
// listar conversaciones, la segunda para saber si la API responde de
// verdad ahora mismo (no solo si CHATWOOT_URL/TOKEN/ACCOUNT_ID están
// configuradas) y para sincronizar los contactos del CRM.
// ============================================================================

import { chatwootFetch, getChatwootConfig } from "@/lib/chatwoot/client"
import { upsertContactFromChatwoot } from "@/lib/api/contacts-demo-store"
import { listInboxes } from "@/lib/chatwoot/inboxes"
import { fetchConversationsFromDb } from "@/lib/api/chatwoot-db"

export function mapChatwootConversation(
  raw: Record<string, unknown>,
  inboxNames: Map<number, string>,
) {
  const meta = (raw.meta as Record<string, unknown>) ?? {}
  const sender = (meta.sender as Record<string, unknown>) ?? {}
  const assignee = meta.assignee as Record<string, unknown> | null | undefined
  const lastMsg = (
    Array.isArray(raw.messages) && raw.messages.length > 0
      ? (raw.messages[raw.messages.length - 1] as Record<string, unknown>)
      : null
  ) as Record<string, unknown> | null
  const inboxId = raw.inbox_id != null ? Number(raw.inbox_id) : null

  return {
    id: String(raw.id ?? ""),
    contactName: String(sender.name ?? "Desconocido"),
    phone: String(sender.phone_number ?? ""),
    avatarUrl: sender.thumbnail ? String(sender.thumbnail) : null,
    assigneeId: assignee ? Number(assignee.id) : null,
    assigneeName: assignee ? String(assignee.name ?? "") : null,
    inboxId,
    inboxName: inboxId !== null ? inboxNames.get(inboxId) ?? `Buzón ${inboxId}` : null,
    lastMessage: lastMsg ? String(lastMsg.content ?? "") : null,
    lastMessageAt: lastMsg
      ? new Date((lastMsg.created_at as number) * 1000).toISOString()
      : null,
    createdAt: new Date(((raw.created_at as number) ?? 0) * 1000).toISOString(),
    unreadCount: (raw.unread_count as number) ?? 0,
    status: String(raw.status ?? "open"),
    handledBy: meta.assignee ? "human" : "ai",
    online: false,
    typing: false,
    messages: [],
    labels: Array.isArray(raw.labels) ? (raw.labels as unknown[]).map(String) : [],
  }
}

export type MappedConversation = ReturnType<typeof mapChatwootConversation>

// Chatwoot crea un registro de conversación nuevo por cada contacto cada
// vez que responde después de que la anterior se marcó "resolved" (p. ej.
// al cerrar una venta) — así es como se comporta su canal de WhatsApp
// Cloud API, no hay ajuste de inbox que lo evite. Para que no se vea como
// un chat "duplicado" en la lista, nos quedamos solo con la conversación
// más reciente por contacto (por teléfono); las anteriores siguen
// existiendo en Chatwoot con su historial intacto, solo no se listan aquí.
//
// La clave incluye el buzón: con más de un número de WhatsApp activo, un
// mismo cliente puede tener una conversación abierta en el buzón viejo y,
// por separado, escribirle al buzón nuevo (típico durante una migración,
// si todavía tiene guardado el número anterior) — son dos conversaciones
// reales y ninguna debe tapar a la otra en la lista.
//
// BUG (encontrado 2026-08-11): "más reciente" se decidía solo por
// actividad, sin mirar el estado. Si para el mismo teléfono+buzón existían
// dos conversaciones — una todavía ABIERTA con mensajes sin leer (p. ej. la
// IA la tomó y nadie la miró después) y otra ya RESUELTA pero con actividad
// más nueva — ganaba la resuelta y la abierta con pendientes desaparecía
// del listado por completo, en cada barrido, sin avisar. Así se explican
// los chats de IA que "nunca salen en Todos": no es un filtro tapándolos,
// es que dedupeByPhone los descarta antes de que lleguen al front.
//
// Regla ahora: una conversación abierta (todo lo que no sea "resolved")
// siempre gana sobre una resuelta, sin importar cuál tiene actividad más
// reciente — nunca hay que perder de vista un chat que sigue esperando
// respuesta a cambio de uno ya cerrado. Solo se compara actividad cuando
// las dos son abiertas, o las dos están resueltas (mismo criterio de
// siempre en esos dos casos).
function isBetterConversation(a: MappedConversation, b: MappedConversation): boolean {
  const aOpen = a.status !== "resolved"
  const bOpen = b.status !== "resolved"
  if (aOpen !== bOpen) return aOpen

  const aActivity = a.lastMessageAt ?? a.createdAt
  const bActivity = b.lastMessageAt ?? b.createdAt
  return aActivity > bActivity
}

function dedupeByPhone(conversations: MappedConversation[]): MappedConversation[] {
  const bestByKey = new Map<string, MappedConversation>()
  const withoutPhone: MappedConversation[] = []

  for (const c of conversations) {
    if (!c.phone) {
      withoutPhone.push(c)
      continue
    }
    const key = `${c.phone}:${c.inboxId ?? ""}`
    const existing = bestByKey.get(key)
    if (!existing || isBetterConversation(c, existing)) {
      bestByKey.set(key, c)
    }
  }

  return [...bestByKey.values(), ...withoutPhone]
}

// Techo de seguridad para los loops de páginas de abajo — a 25 por página
// (el tamaño que usa Chatwoot) son ~1000 conversaciones. De sobra para el
// volumen actual; si algún día se llega a este techo, la solución ya no es
// subir el número sino pedirle a Chatwoot un filtro por fecha en vez de
// traer todo el historial completo en cada carga.
const CONVERSATIONS_PAGE_SAFETY_CAP = 40

interface ConversationsPageResult {
  batch: Record<string, unknown>[]
  allCount: number | null
}

async function fetchConversationsPage(page: number): Promise<ConversationsPageResult> {
  const data = await chatwootFetch<{
    data: { payload: Record<string, unknown>[]; meta?: { all_count?: number } }
  }>(`/conversations?status=all&page=${page}`, { cache: "no-store" })
  return {
    batch: data.data.payload,
    allCount: typeof data.data.meta?.all_count === "number" ? data.data.meta.all_count : null,
  }
}

// Sigue pidiendo páginas EN SERIE desde `fromPage` hasta que una vuelva
// vacía — el camino "correcto pero lento" de siempre, sin asumir ningún
// tamaño de página. Es el fallback de fetchAllConversationsRaw cuando no
// se puede (o no conviene) paralelizar.
//
// BUG (encontrado 2026-08-11): si UNA página de este loop fallaba (timeout,
// 502 puntual), el error subía sin atrapar hasta sweepConversations, que lo
// agarra en su catch genérico y descarta TODO el barrido — incluidas las
// páginas que sí habían llegado bien más arriba (las del camino paralelo,
// protegidas con allSettled). El front recibía un 502 en vez de la lista
// parcial. Y esto era más probable justo bajo carga alta — el peor momento
// para perder el listado completo por un solo tropiezo. Ahora, igual que el
// camino paralelo, una página fallida corta el loop pero devuelve lo que sí
// se pudo traer, marcado `partial: true` en vez de tirarlo todo.
interface SequentialFetchOutcome {
  raw: Record<string, unknown>[]
  partial: boolean
}

async function fetchConversationsSequential(fromPage: number): Promise<SequentialFetchOutcome> {
  const all: Record<string, unknown>[] = []
  for (let page = fromPage; page <= CONVERSATIONS_PAGE_SAFETY_CAP; page++) {
    let result: ConversationsPageResult
    try {
      result = await fetchConversationsPage(page)
    } catch (err) {
      console.error(
        `[chatwoot-sync] la página ${page} del barrido secuencial falló, se corta acá con lo que ya se tiene:`,
        err,
      )
      return { raw: all, partial: true }
    }
    if (result.batch.length === 0) break
    all.push(...result.batch)
  }
  return { raw: all, partial: false }
}

// Chatwoot pagina /conversations — pedir solo la página 1 significa que
// cualquier chat que no esté entre los más recientemente activos no vuelve
// nunca, ni siquiera buscándolo por nombre/teléfono (la búsqueda del front
// solo mira lo que ya está en memoria).
//
// [Paso D, post-incidente 2026-08-11 — ver la nota grande más abajo]
// Antes esto pedía cada página en SERIE (6 páginas × ~3s = ~18s por
// barrido). Ahora, si la página 1 trae `meta.all_count`, se calcula cuántas
// páginas hacen falta (con el tamaño de página OBSERVADO en esa misma
// respuesta, nunca asumido a mano) y se piden todas las demás EN LOTES de
// `CHATWOOT_PAGE_CONCURRENCY` (ver esa constante — no todas a la vez, ver
// el addendum de la nota de incidente más abajo sobre por qué). Si
// `all_count` no viene, se cae al loop en serie de siempre: más lento pero
// siempre correcto, sin depender de un campo no documentado como estable.
//
// Red de seguridad: si la ÚLTIMA página pedida en paralelo vuelve
// completamente llena, probablemente `all_count` quedó desactualizado
// (alguien escribió mientras se armaban las páginas) y puede haber más
// detrás — en ese caso se sigue en serie desde ahí hasta que una vuelva
// vacía, igual que el camino sin `all_count`. Así nunca se vuelve a perder
// conversaciones viejas del listado (el bug que motivó paginar en primer
// lugar) a cambio de la velocidad.
//
// Cuántas a la vez — CHATWOOT_PAGE_CONCURRENCY: Chatwoot corre con
// WEB_CONCURRENCY=3 (3 workers de Puma, confirmado en el servidor,
// 2026-08-11). Pedir las 6-7 páginas restantes todas de una con
// `Promise.all` no las paraleliza de verdad: las hace hacer cola detrás de
// esos 3 procesos. Medido sin caché tras el primer despliegue de este
// archivo: ~10s, PEOR que los ~7.5s de antes de "paralelizar". El límite de
// abajo iguala el paralelismo del código al paralelismo real que Chatwoot
// puede atender. Si algún día se sube WEB_CONCURRENCY en el servidor, subir
// este número junto con eso (y viceversa si se baja).
const CHATWOOT_PAGE_CONCURRENCY = 3

// Pide `pages` sin superar `concurrency` peticiones en vuelo contra
// Chatwoot al mismo tiempo — ver CHATWOOT_PAGE_CONCURRENCY arriba.
//
// BUG (encontrado 2026-08-11, mismo día del primer despliegue de esto):
// la versión anterior armaba LOTES de tamaño `concurrency` y esperaba a que
// las 3 peticiones del lote actual TERMINARAN TODAS antes de lanzar el
// siguiente lote (una barrera). Si una de las 3 tardaba cerca del timeout
// (el p99 real medido en el servidor fue ~11s) mientras las otras 2
// terminaban en 300ms, esos 2 workers de Chatwoot quedaban ociosos varios
// segundos esperando el cierre del lote en vez de arrancar ya la página
// siguiente — justo lo contrario de lo que se buscaba con el límite de
// concurrencia.
//
// Ahora es un pool real: `concurrency` "trabajadores" comparten un cursor
// (`nextIndex`) y cada uno, en cuanto termina su página, toma la próxima
// pendiente — sin esperar a que las demás del "lote" anterior cierren. Los
// 3 workers de Chatwoot quedan ocupados de forma continua en vez de
// sincronizados en bloques. `nextIndex++` es seguro sin lock: JS es de un
// solo hilo, no hay punto de `await` entre leer y avanzar el cursor.
async function fetchPagesLimited(
  pages: number[],
  concurrency: number,
): Promise<PromiseSettledResult<ConversationsPageResult>[]> {
  const results: PromiseSettledResult<ConversationsPageResult>[] = new Array(pages.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < pages.length) {
      const i = nextIndex++
      try {
        results[i] = { status: "fulfilled", value: await fetchConversationsPage(pages[i]) }
      } catch (reason) {
        results[i] = { status: "rejected", reason }
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, pages.length) }, () => worker()),
  )
  return results
}
interface ConversationsFetchOutcome {
  raw: Record<string, unknown>[]
  // true si alguna página del barrido paralelo falló y se siguió con las
  // que sí llegaron, en vez de tirar todo el resultado. Decisión explícita
  // (ver comentario más abajo) — nunca se descarta en silencio, queda
  // registrado con console.error para que aparezca en los logs del
  // contenedor.
  partial: boolean
}

async function fetchAllConversationsRaw(): Promise<ConversationsFetchOutcome> {
  const first = await fetchConversationsPage(1)
  if (first.batch.length === 0) return { raw: [], partial: false }

  const pageSize = first.batch.length
  if (first.allCount === null || pageSize === 0) {
    const rest = await fetchConversationsSequential(2)
    return { raw: [...first.batch, ...rest.raw], partial: rest.partial }
  }

  const totalPages = Math.min(
    Math.ceil(first.allCount / pageSize),
    CONVERSATIONS_PAGE_SAFETY_CAP,
  )
  if (totalPages <= 1) return { raw: first.batch, partial: false }

  // allSettled, no all: si UNA página del barrido falla (timeout, 502
  // puntual), preferimos devolver las ~150 conversaciones que sí llegaron
  // antes que tirar el listado entero y dejar al asesor con la pantalla en
  // blanco por un solo tropiezo. El costo es que la lista puede quedar
  // incompleta por una vuelta — se prioriza disponibilidad sobre
  // completitud acá, a propósito. En lotes de CHATWOOT_PAGE_CONCURRENCY,
  // no todas a la vez — ver fetchPagesLimited arriba.
  const settled = await fetchPagesLimited(
    Array.from({ length: totalPages - 1 }, (_, i) => i + 2),
    CHATWOOT_PAGE_CONCURRENCY,
  )

  const fulfilled: ConversationsPageResult[] = []
  let anyRejected = false
  for (const result of settled) {
    if (result.status === "fulfilled") {
      fulfilled.push(result.value)
    } else {
      anyRejected = true
      console.error("[chatwoot-sync] una página del barrido de conversaciones falló:", result.reason)
    }
  }

  const all = [...first.batch, ...fulfilled.flatMap((r) => r.batch)]

  // Red de seguridad (ver nota de incidente más abajo): si la última
  // página que SÍ se pudo traer vino completamente llena, `all_count`
  // probablemente estaba desactualizado y puede haber más detrás.
  const lastOk = fulfilled[fulfilled.length - 1]
  let safetyNetPartial = false
  if (lastOk && lastOk.batch.length === pageSize) {
    const rest = await fetchConversationsSequential(totalPages + 1)
    all.push(...rest.raw)
    safetyNetPartial = rest.partial
  }

  return { raw: all, partial: anyRejected || safetyNetPartial }
}

type ConversationsResult =
  | { ok: true; conversations: MappedConversation[]; partial: boolean }
  | { ok: false }

// ============================================================================
// NOTA DE INCIDENTE — leer esto primero si Chatwoot vuelve a saturarse o el
// listado de chats vuelve a tardar/quedar en blanco.
//
// Qué pasó (2026-08-11, producción): 137 conversaciones (6 páginas de 25).
// 340 peticiones a /conversations en 2 minutos, Chatwoot al 232% CPU,
// respuestas de hasta 13.5s, front en blanco. Causas combinadas:
//   1. use-chatwoot.ts recargaba el listado COMPLETO en cada "message_changed"
//      del SSE — evento que Chatwoot dispara por CADA mensaje de WhatsApp
//      entrante, no solo cuando cambia algo de la conversación en sí.
//   2. Este módulo no deduplicaba llamadas en vuelo — cada disparador (SSE +
//      polling de respaldo + varias pestañas) lanzaba su propio barrido
//      completo en paralelo con los demás, y todos pegaban a Chatwoot a la vez.
//
// Qué se arregló y en qué orden (los 4 pasos, letras usadas en la
// conversación de este cambio — quedan acá por si hace falta reconstruir el
// razonamiento):
//   A) Single-flight + micro-cache (este bloque, abajo) — colapsa barridos
//      concurrentes en uno solo. Mayor impacto, menor riesgo: se hizo primero.
//   B) use-chatwoot.ts: "message_changed" ya NO recarga el listado completo
//      (ver ese archivo) — solo refresca mensajes si es la conversación
//      activa, o actualiza esa fila en memoria sin red si es otra. La recarga
//      completa queda reservada para "conversation_changed" (mucho menos
//      frecuente: conversación creada/actualizada/cambio de estado).
//   C) use-chatwoot.ts: los "conversation_changed" que sí siguen disparando
//      recarga completa se agrupan en una ventana de ~800ms en vez de una
//      recarga por evento — importa sobre todo en ráfaga (Chatwoot procesando
//      varios cambios seguidos).
//   D) fetchAllConversationsRaw (arriba) pide las páginas 2..N EN PARALELO en
//      vez de en serie cuando Chatwoot manda `meta.all_count` — baja el
//      barrido completo de ~18s a ~3s. Con red de seguridad: si la última
//      página paralela vuelve llena, sigue en serie por si `all_count` estaba
//      desactualizado (para no reintroducir el bug de "no carga contactos
//      viejos" que motivó paginar en primer lugar).
//
// Si esto vuelve a pasar, revisar en este orden: ¿sigue habiendo
// single-flight activo (cacheState.inFlight se está usando)? ¿"message_changed"
// sigue sin recargar el listado completo? ¿el debounce de C sigue en pie en
// use-chatwoot.ts? ¿`meta.all_count` de Chatwoot se puso a devolver algo raro
// (null, 0, un número que no cuadra) y forzó el fallback lento de D?
//
// ----------------------------------------------------------------------
// ADDENDUM (2026-08-11, mismo día — verificado con acceso directo al
// servidor): D tal como se desplegó en 437655b/f296c87 tenía un defecto.
// `Promise.all` sobre las 6-7 páginas restantes asume que Chatwoot las
// atiende en paralelo de verdad — pero Chatwoot corre con
// WEB_CONCURRENCY=3 (nunca se aplicó la subida a 4 que proponía el plan de
// infraestructura original). Con solo 3 workers de Puma, 7 peticiones
// simultáneas no se paralelizan: hacen cola detrás de esos 3 procesos.
// Medido sin caché: ~10s, PEOR que los ~7.5s de antes de "paralelizar". En
// producción esto quedaba oculto casi siempre porque el caché de 15s
// absorbe la mayoría de las cargas — pero cualquier momento en que el
// caché expira con tráfico real simultáneo paga ese costo completo, y eso
// es justo lo que reportaron los asesores como "cargas caóticamente lentas".
//
// Arreglo aplicado: fetchPagesLimited (arriba) — mismo `Promise.allSettled`
// de siempre, pero en lotes de CHATWOOT_PAGE_CONCURRENCY (=3, igualado al
// WEB_CONCURRENCY real de Chatwoot) en vez de todas las páginas a la vez.
// Si el servidor sube WEB_CONCURRENCY, subir esa constante junto con eso —
// son el mismo número por diseño.
// ----------------------------------------------------------------------
//
// ----------------------------------------------------------------------
// ADDENDUM 2 (2026-08-11, mismo día — revisión completa del archivo pedida
// después del addendum anterior): dos hallazgos más, ambos ya corregidos.
//
// 1) fetchConversationsSequential (los caminos de respaldo: cuando Chatwoot
//    no manda `all_count`, y la red de seguridad de arriba) no toleraba
//    fallos — a diferencia del camino paralelo, protegido con `allSettled`
//    a propósito. Si UNA página de esos caminos fallaba, el error subía sin
//    atrapar hasta sweepConversations y tiraba TODO el barrido a `ok:
//    false` (502 al front), incluidas las páginas paralelas que sí habían
//    llegado bien. Y era más probable justo bajo carga alta — el peor
//    momento para perder el listado completo por un solo tropiezo. Ahora
//    fetchConversationsSequential también devuelve `partial: true` en vez
//    de lanzar, igual que el resto del archivo.
//
// 2) fetchPagesLimited armaba lotes de tamaño CHATWOOT_PAGE_CONCURRENCY y
//    esperaba a que el lote ENTERO terminara antes de lanzar el siguiente
//    (una barrera) — si una página del lote tardaba cerca del timeout
//    (p99 real ~11s) mientras las otras dos terminaban rápido, esos 2
//    workers de Chatwoot quedaban ociosos esperando el cierre del lote en
//    vez de arrancar la próxima página ya. Ahora es un pool real: cada
//    worker toma la siguiente página pendiente en cuanto termina la suya,
//    sin esperar a los demás — mismo límite de concurrencia, sin la espera
//    innecesaria.
// ----------------------------------------------------------------------
//
// ----------------------------------------------------------------------
// ADDENDUM 3 (2026-08-11): todo lo de arriba (A-D + los dos hallazgos del
// ADDENDUM 2) reparte mejor la cola contra la API de Chatwoot, pero no baja
// el costo real de cada página: ~900ms de CPU en Ruby serializando JSON,
// medido en el servidor. Con 3 workers de Puma (WEB_CONCURRENCY=3) y ~6-8
// páginas, el piso queda en ~3s incluso con concurrencia perfecta — no es
// cola, es trabajo real que hay que pagar sí o sí mientras se pase por esa
// API.
//
// Se agregó una vía alternativa (tryFetchConversationsFromDb, arriba, y
// lib/api/chatwoot-db.ts) que lee el mismo listado directo del Postgres de
// Chatwoot con un rol de solo lectura (`sbk_front_ro`, SOLO SELECT) — la
// misma consulta mide ~19ms contra el servidor. SOLO para este listado:
// nada que escribe (mandar mensaje, asignar, cerrar, etiquetar) pasa por
// ahí, sigue yendo por chatwootFetch — ver chatwoot-db.ts para el porqué y
// el mapeo campo por campo contra el esquema real de Chatwoot v4.16.2.
//
// Es opcional y con fallback automático: si las variables CHATWOOT_DB_* no
// están configuradas (p. ej. mientras la red de Docker entre este
// contenedor y el Postgres de Chatwoot no está conectada) o la consulta
// falla por lo que sea, sweepConversations cae sola a fetchAllConversationsRaw
// (la vía API de siempre, con todo lo de A-D) sin que el front note nada
// más que el log de cuál vía sirvió esa carga. No hace falta otro deploy
// para activarla — se prende sola en cuanto esas variables queden puestas
// y la red esté lista.
//
// Limitación consciente: avatarUrl siempre sale null por esta vía (es un
// método derivado de Chatwoot con Active Storage, no una columna — no se
// puede replicar por SQL). El front ya tolera avatarUrl null.
// ----------------------------------------------------------------------
//
// Single-flight + micro-cache — el barrido completo de páginas de arriba es
// caro (secuencial: ~3s por página cuando no se pudo paralelizar por D) y
// este módulo se llama en CADA request a /api/chatwoot/conversations.
//
// Es estado de proceso (Node module scope, anclado a globalThis para
// sobrevivir el fast refresh de Turbopack en dev, mismo patrón que
// lib/chatwoot/event-bus.ts) — funciona porque hoy corre una sola réplica.
// Si el despliegue pasa a tener más de una, esto deja de colapsar peticiones
// entre réplicas distintas (cada una tendría su propio caché) y haría falta
// algo compartido (Redis) en su lugar.
// ============================================================================
// 2.5s -> 15s (2026-08-11, plan de optimización de infraestructura): los
// asesores refrescan cada 45s (FALLBACK_POLL_MS en use-chatwoot.ts), así
// que con un TTL corto casi siempre llegaban con el caché frío y pagaban
// el barrido completo de nuevo. A 15s, la mayoría de esos refrescos caen
// dentro de la ventana y se sirven directo sin tocar Chatwoot.
const CACHE_TTL_MS = 15_000

interface ConversationsCacheState {
  inFlight: Promise<ConversationsResult> | null
  fresh: { conversations: MappedConversation[]; partial: boolean; expiresAt: number } | null
}

const globalForConversationsCache = globalThis as unknown as {
  __chatwootConversationsCache?: ConversationsCacheState
}
const cacheState: ConversationsCacheState =
  globalForConversationsCache.__chatwootConversationsCache ?? { inFlight: null, fresh: null }
globalForConversationsCache.__chatwootConversationsCache = cacheState

// Para que una escritura (intervenir, asignar, cerrar venta, etiquetar)
// no quede pisada por este mismo caché: sin esto, una recarga disparada
// por el SSE justo después de escribir podía servir el snapshot de ANTES
// del cambio si alguien había pedido el listado en los 15s previos —
// visualmente, "Intervenir" parecía no hacer nada. Las rutas de escritura
// bajo app/api/chatwoot/conversations/[id]/ llaman a esto apenas Chatwoot
// confirma el cambio, así que la próxima lectura (la que dispara el SSE, o
// cualquier polling mientras tanto) vuelve a pegarle a Chatwoot en vez de
// servir el caché viejo.
export function invalidateConversationsCache(): void {
  cacheState.fresh = null
}

// Intenta la vía rápida (Postgres directo, ver chatwoot-db.ts) antes de la
// API. Devuelve `null` si no está disponible (variables de entorno
// CHATWOOT_DB_* sin configurar todavía — nada que loguear, es el estado
// esperado hasta que la red de Docker quede conectada) o si la consulta
// falló de verdad, en cuyo caso sí queda registrado acá para poder
// confirmar en los logs del contenedor cuál de las dos vías está sirviendo
// cada carga.
async function tryFetchConversationsFromDb(): Promise<MappedConversation[] | null> {
  const config = getChatwootConfig()
  if (!config) return null

  const conversations = await fetchConversationsFromDb(config.accountId)
  if (conversations === null) {
    console.error("[chatwoot-sync] vía Postgres directo no disponible o falló, cae a la API de Chatwoot")
  }
  return conversations
}

async function sweepConversations(): Promise<ConversationsResult> {
  try {
    const viaDb = await tryFetchConversationsFromDb()

    let conversations: MappedConversation[]
    let partial: boolean

    if (viaDb !== null) {
      conversations = dedupeByPhone(viaDb)
      partial = false
    } else {
      // status=all — por defecto Chatwoot solo devuelve conversaciones
      // "open"; sin esto, una conversación resuelta (p. ej. tras cerrar una
      // venta) desaparecería por completo en vez de pasar a "Cerrados".
      const [{ raw: payload, partial: apiPartial }, inboxes] = await Promise.all([
        fetchAllConversationsRaw(),
        listInboxes().catch(() => []),
      ])
      const inboxNames = new Map(inboxes.map((ib) => [ib.id, ib.name]))
      conversations = dedupeByPhone(
        payload.map((raw) => mapChatwootConversation(raw, inboxNames)),
      )
      partial = apiPartial
    }

    // Orden de llegada: el más viejo arriba, los nuevos se van agregando
    // abajo — como una cola de atención. Por `createdAt` (cuándo se abrió la
    // conversación) y no por `lastMessageAt` a propósito: con actividad
    // reordenaría la lista cada vez que alguien escribe, y el pedido es una
    // cola estable, no "los más recientes primero". Único punto donde se
    // arma la lista final, así que cubre tanto la vía Postgres como la de
    // la API por igual.
    conversations = [...conversations].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )

    for (const c of conversations) {
      if (!c.phone) continue
      upsertContactFromChatwoot({
        phone: c.phone,
        name: c.contactName,
        lastMessage: c.lastMessage,
        lastMessageAt: c.lastMessageAt,
        unreadCount: c.unreadCount,
      })
    }

    // Un barrido parcial también se cachea — es mejor servir esas ~150
    // conversaciones desde caché por un rato que reintentar el barrido
    // completo (con la página que ya falló una vez) en cada request.
    cacheState.fresh = { conversations, partial, expiresAt: Date.now() + CACHE_TTL_MS }
    return { ok: true, conversations, partial }
  } catch {
    return { ok: false }
  }
}

// Pide las conversaciones a Chatwoot y sincroniza sus contactos en el CRM
// (por teléfono). Devuelve `ok: false` si la API no responde — así el
// front puede distinguir "no configurado" de "configurado pero caído".
export async function fetchAndSyncConversations(): Promise<ConversationsResult> {
  const now = Date.now()
  if (cacheState.fresh && cacheState.fresh.expiresAt > now) {
    return { ok: true, conversations: cacheState.fresh.conversations, partial: cacheState.fresh.partial }
  }

  // Ya hay un barrido en curso: todo el que llegue mientras tanto espera
  // ESE resultado en vez de lanzar el suyo propio. No hay punto de `await`
  // entre este check y la asignación de abajo, así que dos llamadas
  // "simultáneas" nunca alcanzan a pisarse — JS resuelve una antes de que
  // la otra corra.
  if (cacheState.inFlight) return cacheState.inFlight

  const sweep = sweepConversations().finally(() => {
    cacheState.inFlight = null
  })
  cacheState.inFlight = sweep
  return sweep
}
