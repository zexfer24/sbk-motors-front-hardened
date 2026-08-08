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
// Fuente externa: https://ve.dolarapi.com/v1/dolares/oficial — API pública
// gratuita, sin auth, que espeja la tasa oficial del BCV.
//
// En modo demo (sin Supabase configurado) se cachea en globalThis, igual
// que los demo-stores existentes, para no pegarle a la API externa en cada
// request tampoco.
// ============================================================================

import { getSupabase } from "@/lib/supabase/client"
import { caracasToday } from "@/lib/caracas-time"

export interface ExchangeRate {
  rate: number
  date: string
  source: string
}

const BCV_MIRROR_URL = "https://ve.dolarapi.com/v1/dolares/oficial"
const RATE_STALE_MS = 15 * 60 * 1000

async function fetchFromMirror(): Promise<number> {
  const res = await fetch(BCV_MIRROR_URL, { cache: "no-store" })
  if (!res.ok) throw new Error(`bcv_mirror_error_${res.status}`)
  const data = await res.json()
  const rate = Number(data.promedio)
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("bcv_mirror_invalid_rate")
  return rate
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
      const rate = await fetchFromMirror()
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

  const rate = await fetchFromMirror()

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
