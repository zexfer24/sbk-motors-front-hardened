"use client"

import { useCallback, useEffect, useState } from "react"
import {
  createQuickReply,
  deleteQuickReply,
  fetchQuickReplies,
  updateQuickReply,
} from "@/lib/api/quick-replies"
import type { QuickReply } from "@/lib/quick-replies"

// Se administran desde la burbuja de respuestas rápidas del chat (crear/
// editar/borrar es admin-only, ver proxy.ts) y quedan disponibles para
// cualquier asesor en cualquier chat — no hace falta polling: cambian poco
// y cada quien las recarga al abrir el desplegable.
export function useQuickReplies() {
  const [replies, setReplies] = useState<QuickReply[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchQuickReplies()
      setReplies(data)
    } catch {
      setError("No se pudieron cargar las respuestas rápidas.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const create = useCallback(async (input: { label: string; content: string }) => {
    const result = await createQuickReply(input)
    if ("error" in result) return result
    setReplies((prev) => [...prev, result])
    return result
  }, [])

  const update = useCallback(async (id: string, input: { label: string; content: string }) => {
    const result = await updateQuickReply(id, input)
    if ("error" in result) return result
    setReplies((prev) => prev.map((r) => (r.id === id ? result : r)))
    return result
  }, [])

  const remove = useCallback(async (id: string) => {
    const result = await deleteQuickReply(id)
    if ("error" in result) return result
    setReplies((prev) => prev.filter((r) => r.id !== id))
    return result
  }, [])

  return { replies, loading, error, reload: load, create, update, remove }
}
