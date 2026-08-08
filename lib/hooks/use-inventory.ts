"use client"

import { useCallback, useEffect, useState } from "react"
import { fetchInventory } from "@/lib/api/inventory"
import type { DataSource } from "@/lib/api/shared"
import type { InventoryItemDb } from "@/lib/types/inventory"

export function useInventory() {
  const [items, setItems] = useState<InventoryItemDb[]>([])
  const [source, setSource] = useState<DataSource>("demo")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState("")
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  const load = useCallback(async (p: number, q: string) => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchInventory({ page: p, q })
      setItems(data.items)
      setSource(data.source)
      setTotalPages(data.totalPages)
      setTotalCount(data.totalCount)
    } catch {
      setError("No se pudo cargar el inventario. Intenta de nuevo en un momento.")
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounce solo cuando hay texto de búsqueda — la carga inicial y los
  // cambios de página no necesitan esperar.
  useEffect(() => {
    const delay = query ? 300 : 0
    const timer = setTimeout(() => load(page, query), delay)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, query])

  const search = useCallback((q: string) => {
    setQuery(q)
    setPage(1)
  }, [])

  return {
    items,
    source,
    loading,
    error,
    page,
    setPage,
    query,
    search,
    totalPages,
    totalCount,
    reload: () => load(page, query),
  }
}
