"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { addOrder, deleteOrder, fetchOrders, requestOrderAction, updateOrderStatus } from "@/lib/api/orders"
import type { OrderDateRange } from "@/lib/api/orders"
import type { DataSource } from "@/lib/api/shared"
import type { NewOrderDb, OrderDb, OrderStatus } from "@/lib/types/order"

const POLL_INTERVAL_MS = 45_000

// `active` es falso cuando la pestaña de Ventas sigue montada pero no es
// la que se está viendo — igual que en use-dashboard.ts. Antes esta lista
// solo se cargaba una vez al montar y nunca se volvía a pedir, así que una
// venta cerrada desde el chat (por el mismo usuario o por otro asesor) no
// aparecía hasta recargar toda la página.
//
// `range` (from/to, admin-only del lado del servidor): cambiar de rango
// recarga la lista desde cero, no filtra en el cliente — así el asesor
// (que nunca manda rango) siempre recibe exactamente sus propias ventas
// del servidor, y el admin no descarga el historial completo solo para
// acotarlo visualmente.
export function useOrders(active: boolean = true, range?: OrderDateRange) {
  const [orders, setOrders] = useState<OrderDb[]>([])
  const [source, setSource] = useState<DataSource>("demo")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const wasActive = useRef(active)
  // El polling silencioso de 45s y un reload() manual pueden solaparse; si
  // la respuesta más vieja llega después, pisaría a la más nueva ya
  // pintada. Mismo patrón que conversationsRequestId en use-chatwoot.ts.
  const requestIdRef = useRef(0)
  const rangeKey = `${range?.from ?? ""}|${range?.to ?? ""}`

  const load = useCallback(async (options?: { silent?: boolean }) => {
    const requestId = ++requestIdRef.current
    if (!options?.silent) setLoading(true)
    setError(null)
    try {
      const data = await fetchOrders(range)
      if (requestId !== requestIdRef.current) return
      setOrders(data.orders)
      setSource(data.source)
    } catch {
      if (requestId !== requestIdRef.current) return
      if (!options?.silent) setError("No se pudieron cargar las ventas. Intenta de nuevo en un momento.")
    } finally {
      if (requestId === requestIdRef.current && !options?.silent) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey])

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
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status, pendingRequest: null } : o)))
    const result = await updateOrderStatus(id, status)
    if ("error" in result) {
      setOrders(previous)
      return result
    }
    setOrders((prev) => prev.map((o) => (o.id === id ? result.order : o)))
    return result
  }, [orders])

  // El asesor solicita (no ejecuta) — optimista sobre pendingRequest nomás,
  // el estado real de la venta no cambia hasta que el admin la ejecute.
  const requestAction = useCallback(
    async (id: string, type: "devolucion" | "confirmacion") => {
      const previous = orders
      setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, pendingRequest: type, pendingRequestBy: "…" } : o)),
      )
      const result = await requestOrderAction(id, type)
      if ("error" in result) {
        setOrders(previous)
        return result
      }
      await load({ silent: true })
      return result
    },
    [orders, load],
  )

  const remove = useCallback(async (id: string) => {
    const previous = orders
    setOrders((prev) => prev.filter((o) => o.id !== id))
    const result = await deleteOrder(id)
    if ("error" in result) {
      setOrders(previous)
      return result
    }
    return result
  }, [orders])

  return { orders, source, loading, error, reload: load, create, updateStatus, requestAction, remove }
}
