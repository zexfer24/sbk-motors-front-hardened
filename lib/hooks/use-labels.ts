"use client"

import { useCallback, useEffect, useState } from "react"
import { createLabel, deleteLabel, fetchLabels, updateLabel, type ChatwootLabel } from "@/lib/api/chatwoot"

// Catálogo de categorías (labels de Chatwoot) — se carga una vez al montar
// (cambia poco) y se refresca en memoria al crear una nueva, sin necesidad
// de volver a pedirlo entero. Mismo patrón que use-quick-replies.ts.
export function useLabels() {
  const [labels, setLabels] = useState<ChatwootLabel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setLabels(await fetchLabels())
    } catch {
      setError("No se pudieron cargar las categorías.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const create = useCallback(async (input: { title: string; color: string }) => {
    try {
      const label = await createLabel(input)
      setLabels((prev) => [...prev, label])
      return label
    } catch (err) {
      return { error: err instanceof Error ? err.message : "No se pudo crear la categoría." }
    }
  }, [])

  const update = useCallback(async (id: number, input: { title: string; color: string }) => {
    try {
      const label = await updateLabel(id, input)
      setLabels((prev) => prev.map((l) => (l.id === id ? label : l)))
      return label
    } catch (err) {
      return { error: err instanceof Error ? err.message : "No se pudo editar la categoría." }
    }
  }, [])

  const remove = useCallback(async (id: number) => {
    try {
      await deleteLabel(id)
      setLabels((prev) => prev.filter((l) => l.id !== id))
      return { ok: true as const }
    } catch (err) {
      return { error: err instanceof Error ? err.message : "No se pudo borrar la categoría." }
    }
  }, [])

  return { labels, loading, error, reload: load, create, update, remove }
}
