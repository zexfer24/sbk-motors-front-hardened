'use client'

import { useId, useState } from 'react'
import { Loader2, Pencil, Plus, Tag, Trash2, X } from 'lucide-react'
import type { ChatwootLabel } from '@/lib/api/chatwoot'
import { useAuth } from '@/lib/hooks/use-auth'
import { cn } from '@/lib/utils'

interface LabelsManagerModalProps {
  open: boolean
  labels: ChatwootLabel[]
  loading: boolean
  onClose: () => void
  onCreate: (input: { title: string; color: string }) => Promise<ChatwootLabel | { error: string }>
  onUpdate: (id: number, input: { title: string; color: string }) => Promise<ChatwootLabel | { error: string }>
  onDelete: (id: number) => Promise<{ error: string } | { ok: true }>
}

const DEFAULT_COLOR = '#e0555c'

// Vista previa en vivo de cómo queda el nombre — Chatwoot no acepta
// espacios ni mayúsculas (ver slugifyLabelTitle en lib/chatwoot/labels.ts,
// la limpieza real la hace el servidor; esto es solo para que el asesor no
// se sorprenda con el resultado). Copia intencional en vez de importar esa
// función server-side dentro de un componente cliente.
function previewSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]+/gu, '')
    .replace(/^[-_]+/, '')
}

// Crear y editar el catálogo de etiquetas nativas de Chatwoot está abierto a
// cualquier asesor autenticado (ver proxy.ts); BORRAR sigue admin-only —
// gateado acá mismo (canDelete) además de en el servidor, ya que borrar
// quita la etiqueta de cualquier chat del equipo que la tenga puesta. El
// mismo formulario sirve para crear y editar — entrar en "modo edición"
// precarga el título/color de la categoría elegida en vez de duplicar el
// form.
export function LabelsManagerModal({
  open,
  labels,
  loading,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: LabelsManagerModalProps) {
  const formId = useId()
  const { user } = useAuth()
  const canDelete = user?.role === 'admin'
  const [editingId, setEditingId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  if (!open) return null

  function resetForm() {
    setEditingId(null)
    setTitle('')
    setColor(DEFAULT_COLOR)
    setFormError(null)
  }

  function startEdit(label: ChatwootLabel) {
    setEditingId(label.id)
    setTitle(label.title)
    setColor(label.color)
    setFormError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      setFormError('Escribe un nombre para la categoría.')
      return
    }
    setSaving(true)
    setFormError(null)
    const result = editingId
      ? await onUpdate(editingId, { title: title.trim(), color })
      : await onCreate({ title: title.trim(), color })
    setSaving(false)
    if ('error' in result) {
      setFormError(result.error)
      return
    }
    resetForm()
  }

  async function handleDelete(label: ChatwootLabel) {
    const confirmed = window.confirm(
      `¿Borrar la categoría "${label.title}"? Se quita de cualquier conversación que la tenga.`,
    )
    if (!confirmed) return
    setDeletingId(label.id)
    const result = await onDelete(label.id)
    setDeletingId(null)
    if ('error' in result) {
      setFormError(result.error)
      return
    }
    if (editingId === label.id) resetForm()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={() => {
          resetForm()
          onClose()
        }}
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
            onClick={() => {
              resetForm()
              onClose()
            }}
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
            <div className="flex flex-col gap-1.5">
              {labels.map((l) => (
                <div
                  key={l.id}
                  className={cn(
                    'group flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors',
                    editingId === l.id ? 'border-primary/50 bg-primary/5' : 'border-border',
                  )}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: l.color }} />
                  <span className="flex-1 truncate text-sm text-foreground">{l.title}</span>
                  <button
                    type="button"
                    onClick={() => startEdit(l)}
                    disabled={deletingId === l.id}
                    aria-label={`Editar categoría ${l.title}`}
                    className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-secondary hover:text-foreground group-hover:opacity-100 disabled:opacity-50"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(l)}
                    disabled={deletingId === l.id}
                    aria-label={`Borrar categoría ${l.title}`}
                    className={cn(
                      'rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-primary/10 hover:text-primary group-hover:opacity-100 disabled:opacity-50',
                      !canDelete && 'hidden',
                    )}
                  >
                    {deletingId === l.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-2 border-t border-border pt-4">
            <span className="text-xs font-semibold text-muted-foreground">
              {editingId ? 'Editar categoría' : 'Nueva categoría'}
            </span>
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
            {title.trim() && previewSlug(title) !== title.trim() && (
              <p className="text-[0.7rem] text-muted-foreground">
                Se va a guardar como <span className="font-mono text-foreground">{previewSlug(title) || '—'}</span>
                {' '}— Chatwoot no admite espacios ni mayúsculas en el nombre.
              </p>
            )}

            {formError && (
              <p role="alert" className="rounded-lg bg-primary/10 px-3 py-2 text-xs text-primary">
                {formError}
              </p>
            )}

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={saving}
                className="power-glow flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform active:scale-95 disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : editingId ? (
                  <Pencil className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {editingId ? 'Guardar cambios' : 'Agregar'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                  className="rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                >
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
