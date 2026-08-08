'use client'

import { useId, useState } from 'react'
import { X, Loader2, Pencil, Trash2 } from 'lucide-react'
import type { Contact } from '@/lib/types/contact'
import { cn } from '@/lib/utils'

interface EditContactModalProps {
  contact: Contact | null
  onClose: () => void
  onUpdate: (
    id: string,
    patch: Partial<Pick<Contact, 'name' | 'phone' | 'tag'>>,
  ) => Promise<{ error: string } | { contact: Contact }>
  onDelete: (id: string) => Promise<unknown>
}

const tagOptions = ['Nuevo', 'Frecuente', 'VIP', 'Prospecto', 'Mayorista']

export function EditContactModal({ contact, onClose, onUpdate, onDelete }: EditContactModalProps) {
  const formId = useId()

  const [name, setName] = useState(contact?.name ?? '')
  const [phone, setPhone] = useState(contact?.phone ?? '')
  const [tag, setTag] = useState(contact?.tag ?? 'Nuevo')
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  if (!contact) return null
  const activeContact = contact

  function handleClose() {
    if (submitting || deleting) return
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (!phone.trim() || !name.trim()) {
      setFormError('El teléfono y el nombre son obligatorios.')
      return
    }

    setSubmitting(true)
    const result = await onUpdate(activeContact.id, {
      name: name.trim(),
      phone: phone.trim(),
      tag,
    })
    setSubmitting(false)

    if ('error' in result) {
      setFormError(
        result.error === 'telefono_duplicado'
          ? `Ya existe otro contacto con el teléfono "${phone.trim()}".`
          : 'No se pudo guardar el contacto. Intenta de nuevo.',
      )
      return
    }

    onClose()
  }

  async function handleDelete() {
    setDeleting(true)
    await onDelete(activeContact.id)
    setDeleting(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={handleClose}
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${formId}-title`}
        className="animate-blur-in relative w-full max-w-md overflow-hidden rounded-lg border border-border bg-card shadow-2xl shadow-black/50"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Pencil className="h-4 w-4" strokeWidth={2.5} />
            </span>
            <h2 id={`${formId}-title`} className="heading-stamp text-sm text-foreground">
              Editar contacto
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${formId}-name`} className="text-xs font-semibold text-muted-foreground">
                Nombre
              </label>
              <input
                id={`${formId}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                className="rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${formId}-phone`} className="text-xs font-semibold text-muted-foreground">
                Teléfono
              </label>
              <input
                id={`${formId}-phone`}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                className="rounded-lg border border-input bg-background px-3.5 py-2.5 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Etiqueta</span>
            <div className="flex flex-wrap gap-1.5">
              {tagOptions.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTag(t)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-colors',
                    tag === t
                      ? 'border-primary bg-primary/15 text-foreground shadow-[0_0_12px_oklch(0.58_0.22_25/0.35)]'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {formError && (
            <p role="alert" className="rounded-lg bg-primary/10 px-3 py-2 text-xs text-primary">
              {formError}
            </p>
          )}

          <div className="mt-1 flex items-center justify-between gap-2">
            {/* Delete zone */}
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Eliminar
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">¿Eliminar?</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground transition-transform active:scale-95 disabled:opacity-60"
                >
                  {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Sí, eliminar'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="rounded-md border border-border bg-secondary px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                >
                  No
                </button>
              </div>
            )}

            {/* Save */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClose}
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
                {submitting ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
