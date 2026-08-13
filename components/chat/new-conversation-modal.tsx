'use client'

import { useEffect, useId, useState } from 'react'
import { Loader2, MessageSquarePlus, Search, User, X } from 'lucide-react'
import { fetchContacts } from '@/lib/api/contacts'
import {
  fetchWhatsappTemplates,
  type StartConversationInput,
  type WhatsappInboxTemplates,
  type WhatsappTemplate,
} from '@/lib/api/chatwoot'
import type { Contact } from '@/lib/types/contact'
import { cn } from '@/lib/utils'

interface NewConversationModalProps {
  open: boolean
  onClose: () => void
  onStart: (input: StartConversationInput) => Promise<{ error: string } | { ok: true }>
}

function bodyText(template: WhatsappTemplate): string {
  return template.components.find((c) => c.type === 'BODY')?.text ?? ''
}

// Las plantillas de Meta usan variables posicionales {{1}}, {{2}}, ... en
// el cuerpo — se cuenta el número más alto para saber cuántos campos pedir.
function countPlaceholders(text: string): number {
  const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)]
  if (matches.length === 0) return 0
  return Math.max(...matches.map((m) => Number(m[1])))
}

const PHONE_PATTERN = /^\+\d{8,15}$/

export function NewConversationModal({ open, onClose, onStart }: NewConversationModalProps) {
  const formId = useId()
  const [mode, setMode] = useState<'contact' | 'number'>('contact')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [contactQuery, setContactQuery] = useState('')
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [rawPhone, setRawPhone] = useState('')
  const [rawName, setRawName] = useState('')
  const [inboxes, setInboxes] = useState<WhatsappInboxTemplates[]>([])
  const [selectedInboxId, setSelectedInboxId] = useState<number | null>(null)
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsappTemplate | null>(null)
  const [params, setParams] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setContactsLoading(true)
    fetchContacts()
      .then((data) => setContacts(data.contacts))
      .catch(() => setContacts([]))
      .finally(() => setContactsLoading(false))
    setTemplatesLoading(true)
    fetchWhatsappTemplates()
      .then((data) => {
        setInboxes(data)
        // Con un solo buzón no hace falta que el asesor elija — se
        // preselecciona para no agregarle un paso a un flujo que hasta
        // ahora era de un solo número. Con más de uno, se deja sin elegir
        // a propósito para forzar la selección.
        setSelectedInboxId(data.length === 1 ? data[0].inboxId : null)
      })
      .catch(() => setInboxes([]))
      .finally(() => setTemplatesLoading(false))
  }, [open])

  // Se limpia al cerrar (no al enviar con éxito — onStart ya cierra el
  // modal por su cuenta), para que la próxima vez que se abra empiece de cero.
  useEffect(() => {
    if (open) return
    setMode('contact')
    setContactQuery('')
    setSelectedContact(null)
    setRawPhone('')
    setRawName('')
    setSelectedInboxId(null)
    setSelectedTemplate(null)
    setParams([])
    setFormError(null)
  }, [open])

  if (!open) return null

  const filteredContacts = contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(contactQuery.toLowerCase()) || c.phone.includes(contactQuery),
  )

  const templates = inboxes.find((ib) => ib.inboxId === selectedInboxId)?.templates ?? []

  function selectInbox(inboxId: number) {
    setSelectedInboxId(inboxId)
    setSelectedTemplate(null)
    setParams([])
  }

  function selectTemplate(t: WhatsappTemplate) {
    setSelectedTemplate(t)
    setParams(new Array(countPlaceholders(bodyText(t))).fill(''))
  }

  function previewBody(): string {
    if (!selectedTemplate) return ''
    let text = bodyText(selectedTemplate)
    params.forEach((v, i) => {
      // replaceAll (no replace): si la plantilla repite la misma variable
      // más de una vez en el cuerpo, replace() solo sustituía la primera
      // aparición y dejaba `{{n}}` literal en la segunda.
      text = text.replaceAll(`{{${i + 1}}}`, v.trim() || `{{${i + 1}}}`)
    })
    return text
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const phone = mode === 'contact' ? selectedContact?.phone.trim() : rawPhone.trim()
    const name = mode === 'contact' ? selectedContact?.name.trim() : rawName.trim()

    if (!phone || !PHONE_PATTERN.test(phone)) {
      setFormError('Ingresa un número válido con código de país (ej. +584121234567).')
      return
    }
    if (!name) {
      setFormError('Completa el nombre del contacto.')
      return
    }
    if (!selectedInboxId) {
      setFormError('Elige desde qué buzón se va a enviar el chat.')
      return
    }
    if (!selectedTemplate) {
      setFormError('Selecciona una plantilla para iniciar el chat.')
      return
    }
    if (params.some((p) => !p.trim())) {
      setFormError('Completa todos los datos que pide la plantilla.')
      return
    }

    setSubmitting(true)
    const result = await onStart({
      inboxId: selectedInboxId,
      phone,
      name,
      templateName: selectedTemplate.name,
      templateCategory: selectedTemplate.category,
      templateLanguage: selectedTemplate.language,
      bodyParams: params,
    })
    setSubmitting(false)

    if ('error' in result) {
      setFormError('No se pudo iniciar el chat. Verifica el número e intenta de nuevo.')
      return
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${formId}-title`}
        className="animate-blur-in relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl shadow-black/50"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
              <MessageSquarePlus className="h-4 w-4" strokeWidth={2.5} />
            </span>
            <h2 id={`${formId}-title`} className="heading-stamp text-sm text-foreground">
              Nuevo chat
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
          <div className="rounded-lg border border-dashed border-warning/50 bg-warning/10 px-3.5 py-2.5 text-xs text-warning">
            WhatsApp exige empezar con una plantilla preaprobada cuando no hay una conversación
            abierta en las últimas 24h — por eso este chat se abre enviando una de las plantillas
            de abajo, no un mensaje libre.
          </div>

          <div className="flex gap-1 rounded-lg border border-border bg-background/50 p-1">
            <button
              type="button"
              onClick={() => setMode('contact')}
              className={cn(
                'flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors',
                mode === 'contact' ? 'bg-primary/15 text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Contacto existente
            </button>
            <button
              type="button"
              onClick={() => setMode('number')}
              className={cn(
                'flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors',
                mode === 'number' ? 'bg-primary/15 text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Número nuevo
            </button>
          </div>

          {mode === 'contact' ? (
            <div className="flex flex-col gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={contactQuery}
                  onChange={(e) => setContactQuery(e.target.value)}
                  placeholder="Buscar contacto por nombre o teléfono…"
                  className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div className="max-h-40 overflow-y-auto rounded-lg border border-border">
                {contactsLoading ? (
                  <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Cargando…
                  </div>
                ) : filteredContacts.length === 0 ? (
                  <div className="px-3 py-2.5 text-xs text-muted-foreground">Sin resultados.</div>
                ) : (
                  filteredContacts.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedContact(c)}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-secondary',
                        selectedContact?.id === c.id && 'bg-primary/10',
                      )}
                    >
                      <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{c.name}</span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">{c.phone}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Nombre</label>
                <input
                  value={rawName}
                  onChange={(e) => setRawName(e.target.value)}
                  placeholder="Nombre del contacto"
                  className="rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Número (con código de país)</label>
                <input
                  value={rawPhone}
                  onChange={(e) => setRawPhone(e.target.value)}
                  placeholder="+584121234567"
                  className="rounded-lg border border-input bg-background px-3.5 py-2.5 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
          )}

          {!templatesLoading && inboxes.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Enviar desde</span>
              <div className="flex flex-col gap-2">
                {inboxes.map((ib) => (
                  <button
                    key={ib.inboxId}
                    type="button"
                    onClick={() => selectInbox(ib.inboxId)}
                    className={cn(
                      'rounded-lg border px-3.5 py-2.5 text-left text-sm font-medium transition-colors',
                      selectedInboxId === ib.inboxId
                        ? 'border-primary/60 bg-primary/5 text-foreground'
                        : 'border-border text-muted-foreground hover:bg-secondary/60',
                    )}
                  >
                    {ib.inboxName}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Plantilla para abrir el chat</span>
            {templatesLoading ? (
              <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Cargando plantillas…
              </div>
            ) : inboxes.length > 1 && !selectedInboxId ? (
              <p className="rounded-lg border border-dashed border-border px-3.5 py-3 text-xs text-muted-foreground">
                Elige primero desde qué buzón vas a escribir.
              </p>
            ) : templates.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3.5 py-3 text-xs text-muted-foreground">
                No hay plantillas aprobadas todavía para este buzón — crea y espera la aprobación
                de una en Meta Business Manager antes de poder iniciar chats nuevos.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectTemplate(t)}
                    className={cn(
                      'rounded-lg border px-3.5 py-2.5 text-left transition-colors',
                      selectedTemplate?.id === t.id
                        ? 'border-primary/60 bg-primary/5'
                        : 'border-border hover:bg-secondary/60',
                    )}
                  >
                    <span className="block text-sm font-medium text-foreground">{t.name}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{t.language} · {t.category}</span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">{bodyText(t)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedTemplate && params.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-background/50 p-3">
              <span className="text-xs font-semibold text-muted-foreground">Completa la plantilla</span>
              {params.map((value, i) => (
                <input
                  key={i}
                  value={value}
                  onChange={(e) =>
                    setParams((prev) => prev.map((p, idx) => (idx === i ? e.target.value : p)))
                  }
                  placeholder={`Variable {{${i + 1}}}`}
                  className="rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
                />
              ))}
              <div className="rounded-lg bg-secondary/40 px-3 py-2 text-xs text-foreground">
                {previewBody()}
              </div>
            </div>
          )}

          {formError && (
            <p role="alert" className="rounded-lg bg-primary/10 px-3 py-2 text-xs text-primary">
              {formError}
            </p>
          )}

          <div className="mt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="power-glow flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform active:scale-95 disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? 'Iniciando…' : 'Iniciar chat'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
