"use client"

import { useCallback, useEffect, useState } from "react"
import { addContact, fetchContacts, updateContact, removeContact } from "@/lib/api/contacts"
import type { DataSource } from "@/lib/api/shared"
import type { Contact, NewContact } from "@/lib/types/contact"

export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [source, setSource] = useState<DataSource>("demo")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchContacts()
      setContacts(data.contacts)
      setSource(data.source)
    } catch {
      setError("No se pudieron cargar los contactos. Intenta de nuevo en un momento.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

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
