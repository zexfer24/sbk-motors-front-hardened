"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { addContact, fetchContacts, updateContact, removeContact } from "@/lib/api/contacts"
import type { DataSource } from "@/lib/api/shared"
import type { Contact, NewContact } from "@/lib/types/contact"

const POLL_INTERVAL_MS = 45_000

// `active` es falso cuando la pestaña de Clientes sigue montada pero no es
// la que se está viendo — igual que en use-orders.ts/use-dashboard.ts. Antes
// esta lista se cargaba una sola vez al montar y, como las pestañas nunca se
// desmontan, un contacto agregado o actualizado por otro asesor no aparecía
// hasta recargar toda la página con F5.
export function useContacts(active: boolean = true) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [source, setSource] = useState<DataSource>("demo")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const wasActive = useRef(active)

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true)
    setError(null)
    try {
      const data = await fetchContacts()
      setContacts(data.contacts)
      setSource(data.source)
    } catch {
      if (!options?.silent) setError("No se pudieron cargar los contactos. Intenta de nuevo en un momento.")
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

  const create = useCallback(async (input: NewContact) => {
    const result = await addContact(input)
    if ("error" in result) return result
    setContacts((prev) => [result.contact, ...prev])
    return result
  }, [])

  const update = useCallback(
    async (id: string, patch: Partial<Pick<Contact, "name" | "phone" | "tag">>) => {
      const result = await updateContact(id, patch)
      if ("error" in result) return result
      setContacts((prev) => prev.map((c) => (c.id === id ? result.contact : c)))
      return result
    },
    [],
  )

  const remove = useCallback(
    async (id: string) => {
      const previous = contacts
      setContacts((prev) => prev.filter((c) => c.id !== id))
      const result = await removeContact(id)
      if ("error" in result) setContacts(previous)
      return result
    },
    [contacts],
  )

  return { contacts, source, loading, error, reload: load, create, update, remove }
}
