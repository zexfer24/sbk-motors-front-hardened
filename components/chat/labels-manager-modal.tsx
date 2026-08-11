'use client'

import { useId, useState } from 'react'
import { Loader2, Plus, Tag, X } from 'lucide-react'
import type { ChatwootLabel } from '@/lib/api/chatwoot'

interface LabelsManagerModalProps {
  open: boolean
  labels: ChatwootLabel[]
  loading: boolean
  onClose: () => void
  onCreate: (input: { title: string; color: string }) => Promise<ChatwootLabel | { error: string }>
}

const DEFAULT_COLOR = '#e0555c'

// Admin-only (ver proxy.ts): crea categorías nuevas en el catálogo de
// etiquetas de Chatwoot. A diferencia de las respuestas rápidas, no hay
// edición/borrado acá a propósito — son las labels nativas de la cuenta, y
// renombrarlas/borrarlas desde acá sin más contexto podría descuadrar
// reportes o automatizaciones ya armadas del lado de Chatwoot.
export function LabelsManagerModal({ open, labels, loading, onClose, onCreate }: LabelsManagerModalProps) {
  const formId = useId()
  const [title, setTitle] = useState('')
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  if (!open) return null

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setFormError('Escribe un nombre para la categoría.')
      return
    }
    setCreating(true)
    setFormError(null)
    const result = await onCreate({ title: title.trim(), color })
    setCreating(false)
    if ('error' in result) {
      setFormError(result.error)
      return
    }
    setTitle('')
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
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
        className="animate-blur-in relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl shadow-black/50"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Tag className="h-4 w-4" strokeWidth={2.5} />
            </span>
            <h2 id={`${formId}-title`} className="heading-stamp text-sm text-foreground">
              Categorías
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

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando…
            </div>
          ) : labels.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Todavía no hay categorías — agrega la primera abajo.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {labels.map((l) => (
                <span
                  key={l.id}
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
                  style={{ borderColor: `${l.color}66`, color: l.color, backgroundColor: `${l.color}1a` }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: l.color }} />
                  {l.title}
                </span>
              ))}
            </div>
          )}

          <form onSubmit={handleCreate} className="flex flex-col gap-2 border-t border-border pt-4">
            <span className="text-xs font-semibold text-muted-foreground">Nueva categoría</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                aria-label="Color de la categoría"
                className="h-10 w-10 shrink-0 cursor-pointer rounded-lg border border-input bg-background p-1"
              />
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Nombre (ej. Reclamo, Venta caliente)"
                className="h-10 flex-1 rounded-lg border border-input bg-background px-3.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {formError && (
              <p role="alert" className="rounded-lg bg-primary/10 px-3 py-2 text-xs text-primary">
                {formError}
              </p>
            )}

            <button
              type="submit"
              disabled={creating}
              className="power-glow flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform active:scale-95 disabled:opacity-60"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Agregar
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
