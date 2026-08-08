"use client"

import { useEffect, useState } from "react"
import { caracasToday } from "@/lib/caracas-time"

interface ExchangeRateState {
  rate: number | null
  loading: boolean
  error: string | null
  /** false cuando se pidió la tasa de un día pasado que nunca quedó guardada. */
  available: boolean
}

function baseUrl() {
  if (typeof window !== "undefined") return ""
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
}

// Cada cuánto se vuelve a pedir la tasa de hoy mientras la pestaña sigue
// abierta — el servidor solo le pega a la API externa si su propio caché
// ya está viejo (ver lib/bcv-rate.ts), así que este intervalo es barato.
const POLL_MS = 5 * 60 * 1000

// Pide la tasa BCV del día indicado (por defecto hoy). Si es hoy, la
// refresca periódicamente para reflejar una corrección del BCV el mismo
// día sin que el usuario tenga que recargar la página. Mientras `rate` es
// null (cargando, falló, o es un día pasado sin tasa guardada), los
// componentes que la usan deben mostrar los montos en Bs sin convertir en
// vez de bloquear la pantalla.
export function useExchangeRate(date: string = caracasToday()): ExchangeRateState {
  const [rate, setRate] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [available, setAvailable] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch(`${baseUrl()}/api/exchange-rate?date=${date}`, { cache: "no-store" })
        if (!res.ok) throw new Error("No se pudo cargar la tasa BCV")
        const data = await res.json()
        if (cancelled) return
        setRate(data.rate === null || data.rate === undefined ? null : Number(data.rate))
        setAvailable(Boolean(data.available))
        setError(null)
      } catch {
        if (!cancelled) setError("No se pudo cargar la tasa BCV")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    setLoading(true)
    load()

    const isToday = date === caracasToday()
    const interval = isToday ? setInterval(load, POLL_MS) : null

    return () => {
      cancelled = true
      if (interval) clearInterval(interval)
    }
  }, [date])

  return { rate, loading, error, available }
}
