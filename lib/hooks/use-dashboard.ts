"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { DataSource } from "@/lib/api/shared"
import { caracasToday } from "@/lib/caracas-time"

export interface DashboardKpi {
  id: string
  label: string
  value: string
  trend: number
  hint: string
  available: boolean
}

export interface DashboardHourly {
  labels: string[]
  revenue: number[]
  chats: number[]
  messages: number[]
  chatwootAvailable: boolean
}

function baseUrl() {
  if (typeof window !== "undefined") return ""
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
}

const EMPTY_HOURLY: DashboardHourly = { labels: [], revenue: [], chats: [], messages: [], chatwootAvailable: false }

const POLL_INTERVAL_MS = 45_000

// El Panel es un resumen "del día" — puede ser hoy o un día pasado que el
// usuario eligió ver. `date` (YYYY-MM-DD, Caracas) por defecto es hoy.
// `active` es falso cuando la pestaña del Panel sigue montada pero no es
// la que se está viendo — en ese caso se pausa el refresco automático en
// segundo plano (igual que en use-chatwoot.ts) en vez de seguir pegándole
// a Supabase/Chatwoot cada rato sin que nadie esté mirando.
export function useDashboard(date: string = caracasToday(), active: boolean = true) {
  const [kpis, setKpis] = useState<DashboardKpi[]>([])
  const [hourly, setHourly] = useState<DashboardHourly>(EMPTY_HOURLY)
  const [source, setSource] = useState<DataSource>("demo")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // El polling silencioso de 45s y un reload() manual (o un cambio de
  // `date`) pueden solaparse; si la respuesta más vieja llega después,
  // pisaría a la más nueva ya pintada. Mismo patrón que
  // conversationsRequestId en use-chatwoot.ts.
  const requestIdRef = useRef(0)

  const load = useCallback(async (options?: { silent?: boolean }) => {
    const requestId = ++requestIdRef.current
    if (!options?.silent) setLoading(true)
    setError(null)
    try {
      const [kpisRes, hourlyRes] = await Promise.all([
        fetch(`${baseUrl()}/api/dashboard/kpis?date=${date}`, { cache: "no-store" }),
        fetch(`${baseUrl()}/api/dashboard/hourly?date=${date}`, { cache: "no-store" }),
      ])
      if (!kpisRes.ok || !hourlyRes.ok) throw new Error("No se pudo cargar el panel")

      const kpisData = await kpisRes.json()
      const hourlyData = await hourlyRes.json()
      if (requestId !== requestIdRef.current) return

      setKpis(kpisData.kpis as DashboardKpi[])
      setHourly({
        labels: hourlyData.labels as string[],
        revenue: hourlyData.revenue as number[],
        chats: hourlyData.chats as number[],
        messages: hourlyData.messages as number[],
        chatwootAvailable: hourlyData.chatwootAvailable as boolean,
      })
      setSource(kpisData.source as DataSource)
    } catch {
      if (requestId !== requestIdRef.current) return
      if (!options?.silent) setError("No se pudo cargar el panel. Intenta de nuevo en un momento.")
    } finally {
      if (requestId === requestIdRef.current && !options?.silent) setLoading(false)
    }
  }, [date])

  useEffect(() => {
    load()
  }, [load])

  // Solo tiene sentido refrescar solo/a "hoy" — un día pasado ya cerró y
  // no va a cambiar.
  const isToday = date === caracasToday()

  useEffect(() => {
    if (!active || !isToday) return
    const interval = setInterval(() => {
      load({ silent: true })
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [active, isToday, load])

  return { kpis, hourly, source, loading, error, reload: load }
}
