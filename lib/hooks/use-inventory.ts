"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { fetchInventory } from "@/lib/api/inventory"
import type { DataSource } from "@/lib/api/shared"
import type { InventoryItemDb } from "@/lib/types/inventory"

const POLL_INTERVAL_MS = 45_000

// `active` es falso cuando la pestaña de Inventario sigue montada pero no es
// la que se está viendo — igual que en use-orders.ts/use-contacts.ts. Antes
// esta lista se cargaba una sola vez al montar y, como las pestañas nunca se
// desmontan, un cambio de stock hecho por otro asesor no aparecía hasta
// recargar toda la página con F5.
export function useInventory(active: boolean = true) {
  const [items, setItems] = useState<InventoryItemDb[]>([])
  const [source, setSource] = useState<DataSource>("demo")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState("")
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const wasActive = useRef(active)
  // Clics de paginación seguidos (sin texto de búsqueda, delay 0) pueden
  // disparar dos fetch casi a la vez; si el de una página vieja responde
  // después que el de la página actual, pisaría los resultados mostrados
  // sin que el control de paginación se entere. Mismo patrón que
  // conversationsRequestId en use-chatwoot.ts.
  const requestIdRef = useRef(0)

  const load = useCallback(async (p: number, q: string, options?: { silent?: boolean }) => {
    const requestId = ++requestIdRef.current
    if (!options?.silent) setLoading(true)
    setError(null)
    try {
      const data = await fetchInventory({ page: p, q })
      if (requestId !== requestIdRef.current) return
      setItems(data.items)
      setSource(data.source)
      setTotalPages(data.totalPages)
      setTotalCount(data.totalCount)
    } catch {
      if (requestId !== requestIdRef.current) return
      if (!options?.silent) setError("No se pudo cargar el inventario. Intenta de nuevo en un momento.")
    } finally {
      if (requestId === requestIdRef.current && !options?.silent) setLoading(false)
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

  useEffect(() => {
    if (!active) return
    const interval = setInterval(() => {
      load(page, query, { silent: true })
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [active, page, query, load])

  // Al volver a la pestaña después de haberla dejado en pausa, refresca de
  // una vez en lugar de esperar al próximo tick del polling. A propósito
  // solo depende de `active` — si la página/búsqueda cambiaron mientras la
  // pestaña estaba en pausa, el efecto de arriba ya se encarga de eso.
  useEffect(() => {
    if (active && !wasActive.current) {
      load(page, query, { silent: true })
    }
    wasActive.current = active
  }, [active, page, query, load])

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
