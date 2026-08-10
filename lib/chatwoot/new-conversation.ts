// ============================================================================
// Iniciar un chat nuevo (contacto nuevo o número nuevo) enviando una
// plantilla preaprobada de WhatsApp — necesario porque Meta no deja
// mandar un mensaje libre a alguien que no te escribió en las últimas 24h;
// hay que abrir la conversación con una plantilla aprobada (HSM).
// ============================================================================
// Basado en la documentación oficial de Chatwoot (developers.chatwoot.com)
// más una verificación real de solo lectura contra esta cuenta (inbox,
// plantillas, forma exacta de contact_inboxes). Lo único que NO se pudo
// probar en vivo fue el envío real de la plantilla — crear un contacto o
// una conversación de prueba contra producción se bloqueó a propósito
// (acción de escritura sobre datos reales). Antes de usarlo con clientes
// reales, pruébalo una vez con un número que controles tú.
//
// LIMITACIÓN CONOCIDA (bug reportado en Chatwoot, issues #13257/#13851):
// los parámetros de plantillas con variables en el HEADER o con nombre (no
// posicionales) a veces no se reenvían bien a la API de WhatsApp y Meta
// responde el error #132000. Por eso esto solo soporta variables
// posicionales del BODY ({{1}}, {{2}}, ...) — el caso que sí funciona de
// forma confiable.
//
// chatwootFetch() (lib/chatwoot/client.ts) ya valida cada `path` contra
// traversal — todos los paths de aquí abajo son literales fijos o IDs
// numéricos devueltos por la propia API de Chatwoot, nunca algo que
// escriba un usuario.
// ============================================================================

import { chatwootFetch } from "@/lib/chatwoot/client"
import { listWhatsappInboxes } from "@/lib/chatwoot/inboxes"

export interface WhatsappTemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS"
  format?: string
  text?: string
}

export interface WhatsappTemplate {
  id: string
  name: string
  status: string
  category: string
  language: string
  components: WhatsappTemplateComponent[]
}

export interface WhatsappInboxTemplates {
  inboxId: number
  inboxName: string
  templates: WhatsappTemplate[]
}

// Solo plantillas APROBADAS por Meta — las pendientes/rechazadas no se
// pueden usar para enviar, mostrarlas solo confundiría al asesor.
async function approvedTemplatesFor(inboxId: number): Promise<WhatsappTemplate[]> {
  const inbox = await chatwootFetch<Record<string, unknown>>(`/inboxes/${inboxId}`)
  const templates = (inbox.message_templates as WhatsappTemplate[] | undefined) ?? []
  return templates.filter((t) => t.status === "APPROVED")
}

// Cada número de WhatsApp tiene su propio set de plantillas aprobadas por
// Meta (no se comparten entre buzones) — por eso "Nuevo chat" necesita ver
// las de TODOS los buzones de WhatsApp, agrupadas, y no solo las del primero
// que se encuentre.
export async function getWhatsappInboxesWithTemplates(): Promise<WhatsappInboxTemplates[]> {
  const inboxes = await listWhatsappInboxes()
  return Promise.all(
    inboxes.map(async (inbox) => ({
      inboxId: inbox.id,
      inboxName: inbox.name,
      templates: await approvedTemplatesFor(inbox.id),
    })),
  )
}

interface ContactInboxEntry {
  source_id: string
  inbox: { id: number }
}

// El source_id "normal" para WhatsApp Cloud es el teléfono en E.164 sin el
// "+" — lo confirmamos leyendo un contact_inbox real de esta cuenta. Un
// mismo contacto puede tener más de un contact_inbox para el mismo inbox
// (p. ej. uno originado por un anuncio de "Click to WhatsApp" trae un
// source_id con otro formato) — se prefiere el que coincide con el
// teléfono; cualquier otro es un candidato secundario, no el que se busca.
function phoneSourceId(phone: string): string {
  return phone.replace(/^\+/, "")
}

async function findOrCreateContact(
  phone: string,
  name: string,
  inboxId: number,
): Promise<{ contactId: number; sourceId: string }> {
  const expectedSourceId = phoneSourceId(phone)

  const search = await chatwootFetch<{ payload: Array<Record<string, unknown>> }>(
    `/contacts/search?q=${encodeURIComponent(phone)}`,
  )
  const existing = search.payload.find((c) => phoneSourceId(String(c.phone_number ?? "")) === expectedSourceId)

  if (existing) {
    const contactId = Number(existing.id)
    const detail = await chatwootFetch<{ payload: Record<string, unknown> }>(`/contacts/${contactId}`)
    const inboxes = (detail.payload.contact_inboxes as ContactInboxEntry[] | undefined) ?? []
    const forThisInbox = inboxes.filter((ci) => ci.inbox?.id === inboxId)
    const match = forThisInbox.find((ci) => ci.source_id === expectedSourceId) ?? forThisInbox[0]
    if (match) return { contactId, sourceId: match.source_id }

    // El contacto existe pero nunca tuvo conversación en este inbox
    // todavía — se crea el contact_inbox para poder abrir una ahora.
    await chatwootFetch(`/contacts/${contactId}/contact_inboxes`, {
      method: "POST",
      body: JSON.stringify({ inbox_id: inboxId, source_id: expectedSourceId }),
    })
    return { contactId, sourceId: expectedSourceId }
  }

  const created = await chatwootFetch<{
    payload: { contact: { id: number }; contact_inbox?: { source_id: string } }
  }>("/contacts", {
    method: "POST",
    body: JSON.stringify({ inbox_id: inboxId, name, phone_number: phone }),
  })
  const contact = created.payload.contact
  if (!contact?.id) throw new Error("chatwoot_no_creo_el_contacto")
  return { contactId: contact.id, sourceId: created.payload.contact_inbox?.source_id ?? expectedSourceId }
}

export interface StartConversationInput {
  /** Buzón de WhatsApp desde el que se manda — cada número tiene sus propias plantillas y contactos. */
  inboxId: number
  phone: string
  name: string
  templateName: string
  templateCategory: string
  templateLanguage: string
  /** Valores para las variables posicionales del cuerpo: {{1}}, {{2}}, ... en orden. */
  bodyParams: string[]
}

export async function startWhatsappConversation(
  input: StartConversationInput,
): Promise<{ conversationId: string }> {
  const { inboxId } = input
  const { contactId, sourceId } = await findOrCreateContact(input.phone, input.name, inboxId)

  const conversation = await chatwootFetch<{ id: number }>("/conversations", {
    method: "POST",
    body: JSON.stringify({ source_id: sourceId, inbox_id: inboxId, contact_id: contactId, status: "open" }),
  })
  if (!conversation.id) throw new Error("chatwoot_no_creo_la_conversacion")

  const body: Record<string, string> = {}
  input.bodyParams.forEach((value, i) => {
    body[String(i + 1)] = value
  })

  await chatwootFetch(`/conversations/${conversation.id}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content: input.templateName,
      template_params: {
        name: input.templateName,
        category: input.templateCategory,
        language: input.templateLanguage,
        processed_params: { body },
      },
    }),
  })

  return { conversationId: String(conversation.id) }
}
