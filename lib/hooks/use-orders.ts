"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { addOrder, fetchOrders, updateOrderStatus } from "@/lib/api/orders"
import type { DataSource } from "@/lib/api/shared"
import type { NewOrderDb, OrderDb, OrderStatus } from "@/lib/types/order"

const POLL_INTERVAL_MS = 45_000

// `active` es falso cuando la pestaña de Ventas sigue montada pero no es
// la que se está viendo — igual que en use-dashboard.ts. Antes esta lista
// solo se cargaba una vez al montar y nunca se volvía a pedir, así que una
// venta cerrada desde el chat (por el mismo usuario o por otro asesor) no
// aparecía hasta recargar toda la página.
export function useOrders(active: boolean = true) {
  const [orders, setOrders] = useState<OrderDb[]>([])
  const [source, setSource] = useState<DataSource>("demo")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const wasActive = useRef(active)

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true)
    setError(null)
    try {
      const data = await fetchOrders()
      setOrders(data.orders)
      setSource(data.source)
    } catch {
      if (!options?.silent) setError("No se pudieron cargar las ventas. Intenta de nuevo en un momento.")
    } finally {
      if (!options?.silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!active) return
    const interval = setInterval(() => {
      load({ silent: true })
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [active, load])

  // Al volver a la pestaña después de haberla dejado en pausa, refresca de
  // una vez en lugar de esperar al próximo tick del polling.
  useEffect(() => {
    if (active && !wasActive.current) {
      load({ silent: true })
    }
    wasActive.current = active
  }, [active, load])

  const create = useCallback(async (input: NewOrderDb) => {
    const result = await addOrder(input)
    if ("error" in result) return result
    setOrders((prev) => [result.order, ...prev])
    return result
  }, [])

  const updateStatus = useCallback(async (id: string, status: OrderStatus) => {
    const previous = orders
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)))
    const result = await updateOrderStatus(id, status)
    if ("error" in result) {
      setOrders(previous)
      return result
    }
    setOrders((prev) => prev.map((o) => (o.id === id ? result.order : o)))
    return result
  }, [orders])

  return { orders, source, loading, error, reload: load, create, updateStatus }
}
