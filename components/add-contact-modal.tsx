'use client'

import { useId, useState } from 'react'
import { X, Loader2, UserPlus } from 'lucide-react'
import type { NewContact } from '@/lib/types/contact'

interface AddContactModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (input: NewContact) => Promise<{ error: string } | { contact: unknown }>
}

const tagOptions = ['Nuevo', 'Frecuente', 'VIP', 'Prospecto', 'Mayorista']

export function AddContactModal({ open, onClose, onSubmit }: AddContactModalProps) {
  const formId = useId()
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [tag, setTag] = useState('Nuevo')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  if (!open) return null

  function reset() {
    setPhone('')
    setName('')
    setTag('Nuevo')
    setFormError(null)
  }

  function handleClose() {
    if (submitting) return
    reset()
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (!phone.trim() || !name.trim()) {
      setFormError('Completa el teléfono y el nombre del cliente.')
      return
    }

    setSubmitting(true)
    const result = await onSubmit({
      phone: phone.trim(),
      name: name.trim(),
      tag,
    })
    setSubmitting(false)

    if ('error' in result) {
      setFormError(
        result.error === 'telefono_duplicado'
          ? `Ya existe un contacto con el teléfono "${phone.trim()}".`
          : 'No se pudo agregar el contacto. Intenta de nuevo.',
      )
      return
    }

    reset()
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
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
              <UserPlus className="h-4 w-4" strokeWidth={2.5} />
            </span>
            <h2 id={`${formId}-title`} className="heading-stamp text-sm text-foreground">
              Agregar contacto
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

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${formId}-phone`} className="text-xs font-semibold text-muted-foreground">
              Teléfono
            </label>
            <input
              id={`${formId}-phone`}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ej. +58 412 555 1023"
              autoFocus
              className="rounded-lg border border-input bg-background px-3.5 py-2.5 font-mono text-sm text-foreground outline-none placeholder:font-sans placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${formId}-name`} className="text-xs font-semibold text-muted-foreground">
              Nombre del cliente
            </label>
            <input
              id={`${formId}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. José Rodríguez"
              className="rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${formId}-tag`} className="text-xs font-semibold text-muted-foreground">
              Etiqueta
            </label>
            <select
              id={`${formId}-tag`}
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              className="rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
            >
              {tagOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {formError && (
            <p role="alert" className="rounded-lg bg-primary/10 px-3 py-2 text-xs text-primary">
              {formError}
            </p>
          )}

          <div className="mt-1 flex items-center justify-end gap-2">
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
              {submitting ? 'Agregando…' : 'Agregar contacto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
