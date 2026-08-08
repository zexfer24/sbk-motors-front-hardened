"use client"

import { useCallback, useEffect, useState } from "react"
import { addOrder, fetchOrders, updateOrderStatus } from "@/lib/api/orders"
import type { DataSource } from "@/lib/api/shared"
import type { NewOrderDb, OrderDb, OrderStatus } from "@/lib/types/order"

export function useOrders() {
  const [orders, setOrders] = useState<OrderDb[]>([])
  const [source, setSource] = useState<DataSource>("demo")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchOrders()
      setOrders(data.orders)
      setSource(data.source)
    } catch {
      setError("No se pudieron cargar las ventas. Intenta de nuevo en un momento.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

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
