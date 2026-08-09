// ============================================================================
// Tasa oficial del BCV (Bs por USD) — SOLO de servidor.
// ============================================================================
// El BCV publica una tasa por día, pero puede corregirla el mismo día — por
// eso no basta con pedirla una vez y cachearla para siempre hasta mañana.
// Cacheamos en Supabase (tabla exchange_rates, ver
// db/exchange_rates_schema.sql) y solo la volvemos a pedir afuera cuando el
// caché de hoy tiene más de RATE_STALE_MS — así el Panel refleja un cambio
// en la página del BCV en minutos, no al día siguiente.
//
// Fuente principal: bcv.org.ve directo — se lee el HTML de la portada y se
// extrae el valor del widget "USD" (id="dolar"). Antes se usaba solo
// https://ve.dolarapi.com/v1/dolares/oficial (API espejo, gratuita, sin
// auth), pero se detectó que puede quedarse desactualizada varios días sin
// avisar (fechaActualizacion vieja, tasa distinta a la real). Esa API
// queda como respaldo, solo si bcv.org.ve no responde — les pasa de vez en
// cuando que el sitio se cae.
//
// En modo demo (sin Supabase configurado) se cachea en globalThis, igual
// que los demo-stores existentes, para no pegarle a las fuentes externas en
// cada request tampoco.
// ============================================================================

import { getSupabase } from "@/lib/supabase/client"
import { caracasToday } from "@/lib/caracas-time"

export interface ExchangeRate {
  rate: number
  date: string
  source: string
}

const BCV_OFFICIAL_URL = "https://www.bcv.org.ve/"
const BCV_MIRROR_URL = "https://ve.dolarapi.com/v1/dolares/oficial"
const RATE_STALE_MS = 15 * 60 * 1000

// El widget del dólar en la portada del BCV es el único con id="dolar" en
// toda la página, y el <strong class="strong-tb"> que le sigue es su valor
// (los otros widgets de moneda —EUR, CNY, TRY, RUB— no llevan id propio).
// El número usa coma como separador decimal (formato venezolano); si algún
// día la tasa supera los miles también llevaría punto de millar, por eso se
// quita cualquier punto antes de convertir la coma en punto decimal.
const BCV_WIDGET_PATTERN = /id="dolar"[\s\S]*?<strong class="strong-tb">\s*([\d.,]+)\s*<\/strong>/

async function fetchFromBcvOfficial(): Promise<number> {
  const res = await fetch(BCV_OFFICIAL_URL, { cache: "no-store" })
  if (!res.ok) throw new Error(`bcv_official_error_${res.status}`)
  const html = await res.text()
  const match = html.match(BCV_WIDGET_PATTERN)
  if (!match) throw new Error("bcv_official_parse_error")
  const rate = Number(match[1].replace(/\./g, "").replace(",", "."))
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("bcv_official_invalid_rate")
  return rate
}

async function fetchFromMirror(): Promise<number> {
  const res = await fetch(BCV_MIRROR_URL, { cache: "no-store" })
  if (!res.ok) throw new Error(`bcv_mirror_error_${res.status}`)
  const data = await res.json()
  const rate = Number(data.promedio)
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("bcv_mirror_invalid_rate")
  return rate
}

async function fetchRate(): Promise<number> {
  try {
    return await fetchFromBcvOfficial()
  } catch (err) {
    console.warn(`[bcv-rate] bcv.org.ve falló, usando espejo: ${err instanceof Error ? err.message : err}`)
    return await fetchFromMirror()
  }
}

interface DemoRateEntry {
  rate: number
  fetchedAtMs: number
}

const globalForRate = globalThis as unknown as { __exchangeRateStore?: Map<string, DemoRateEntry> }

function getDemoStore(): Map<string, DemoRateEntry> {
  if (!globalForRate.__exchangeRateStore) {
    globalForRate.__exchangeRateStore = new Map()
  }
  return globalForRate.__exchangeRateStore
}

export async function getTodayRate(): Promise<ExchangeRate> {
  const date = caracasToday()
  const supabase = getSupabase()

  if (!supabase) {
    const store = getDemoStore()
    const cached = store.get(date)
    if (!cached || Date.now() - cached.fetchedAtMs > RATE_STALE_MS) {
      const rate = await fetchRate()
      store.set(date, { rate, fetchedAtMs: Date.now() })
      return { rate, date, source: "bcv" }
    }
    return { rate: cached.rate, date, source: "bcv" }
  }

  const { data: existing } = await supabase
    .from("exchange_rates")
    .select("rate, fetched_at")
    .eq("rate_date", date)
    .maybeSingle()

  if (existing && Date.now() - new Date(existing.fetched_at).getTime() <= RATE_STALE_MS) {
    return { rate: Number(existing.rate), date, source: "bcv" }
  }

  const rate = await fetchRate()

  await supabase
    .from("exchange_rates")
    .upsert({ rate_date: date, rate, source: "bcv", fetched_at: new Date().toISOString() }, { onConflict: "rate_date" })

  return { rate, date, source: "bcv" }
}

/**
 * Tasa de una fecha específica (para ver días pasados en el Panel). Para
 * "hoy" reusa getTodayRate() (con refresco por staleness); para fechas
 * pasadas solo lee el caché — la API espejo del BCV no expone historial, así
 * que si ese día no se guardó una tasa, no hay forma de recuperarla.
 */
export async function getRateForDate(date: string): Promise<ExchangeRate | null> {
  if (date === caracasToday()) return getTodayRate()

  const supabase = getSupabase()

  if (!supabase) {
    const cached = getDemoStore().get(date)
    return cached ? { rate: cached.rate, date, source: "bcv" } : null
  }

  const { data: existing } = await supabase
    .from("exchange_rates")
    .select("rate")
    .eq("rate_date", date)
    .maybeSingle()

  return existing ? { rate: Number(existing.rate), date, source: "bcv" } : null
}
