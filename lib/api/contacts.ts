import type { Contact, NewContact } from "@/lib/types/contact"
import type { DataSource } from "@/lib/api/shared"

function baseUrl() {
  if (typeof window !== "undefined") return ""
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
}

export async function fetchContacts(): Promise<{ contacts: Contact[]; source: DataSource }> {
  const res = await fetch(`${baseUrl()}/api/contacts`, { cache: "no-store" })
  if (!res.ok) throw new Error("No se pudieron cargar los contactos")
  const data = await res.json()
  return { contacts: data.contacts as Contact[], source: data.source as DataSource }
}

export async function addContact(
  input: NewContact,
): Promise<{ contact: Contact } | { error: string }> {
  const res = await fetch(`${baseUrl()}/api/contacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  const data = await res.json()
  if (!res.ok) return { error: data.error ?? "error_desconocido" }
  return { contact: data as Contact }
}

export async function updateContact(
  id: string,
  patch: Partial<Pick<Contact, "name" | "phone" | "tag">>,
): Promise<{ contact: Contact } | { error: string }> {
  const res = await fetch(`${baseUrl()}/api/contacts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  })
  const data = await res.json()
  if (!res.ok) return { error: data.error ?? "error_desconocido" }
  return { contact: data as Contact }
}

export async function removeContact(id: string): Promise<{ ok: true } | { error: string }> {
  const res = await fetch(`${baseUrl()}/api/contacts/${id}`, { method: "DELETE" })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { error: data.error ?? "error_desconocido" }
  return { ok: true }
}

