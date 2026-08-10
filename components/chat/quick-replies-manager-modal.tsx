'use client'

import { useId, useState } from 'react'
import { Loader2, Pencil, Plus, Settings2, Trash2, X } from 'lucide-react'
import type { QuickReply } from '@/lib/quick-replies'

interface QuickRepliesManagerModalProps {
  open: boolean
  replies: QuickReply[]
  loading: boolean
  onClose: () => void
  onCreate: (input: { label: string; content: string }) => Promise<{ error: string } | QuickReply>
  onUpdate: (
    id: string,
    input: { label: string; content: string },
  ) => Promise<{ error: string } | QuickReply>
  onDelete: (id: string) => Promise<{ error: string } | { ok: true }>
}

// Admin-only (ver proxy.ts): crea/edita/borra las respuestas rápidas que
// después ve cualquier asesor en el desplegable del chat. Se guardan en el
// servidor (app/api/quick-replies) — apenas se confirma un cambio, queda
// disponible para cualquier otro chat, de cualquier asesor, sin recargar.
export function QuickRepliesManagerModal({
  open,
  replies,
  loading,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: QuickRepliesManagerModalProps) {
  const formId = useId()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editContent, setEditContent] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newContent, setNewContent] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  if (!open) return null

  function startEdit(reply: QuickReply) {
    setEditingId(reply.id)
    setEditLabel(reply.label)
    setEditContent(reply.content)
    setFormError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditLabel('')
    setEditContent('')
  }

  async function handleSaveEdit(id: string) {
    if (!editLabel.trim() || !editContent.trim()) {
      setFormError('Completa la etiqueta y el contenido.')
      return
    }
    setBusyId(id)
    setFormError(null)
    const result = await onUpdate(id, { label: editLabel.trim(), content: editContent.trim() })
    setBusyId(null)
    if ('error' in result) {
      setFormError('No se pudo guardar el cambio. Intenta de nuevo.')
      return
    }
    cancelEdit()
  }

  async function handleDelete(id: string) {
    setBusyId(id)
    setFormError(null)
    const result = await onDelete(id)
    setBusyId(null)
    if ('error' in result) {
      setFormError('No se pudo borrar. Intenta de nuevo.')
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newLabel.trim() || !newContent.trim()) {
      setFormError('Completa la etiqueta y el contenido.')
      return
    }
    setCreating(true)
    setFormError(null)
    const result = await onCreate({ label: newLabel.trim(), content: newContent.trim() })
    setCreating(false)
    if ('error' in result) {
      setFormError('No se pudo crear. Intenta de nuevo.')
      return
    }
    setNewLabel('')
    setNewContent('')
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
              <Settings2 className="h-4 w-4" strokeWidth={2.5} />
            </span>
            <h2 id={`${formId}-title`} className="heading-stamp text-sm text-foreground">
              Respuestas rápidas
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
          ) : replies.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Todavía no hay respuestas rápidas — agrega la primera abajo.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {replies.map((reply) =>
                editingId === reply.id ? (
                  <div key={reply.id} className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-background/50 p-3">
                    <input
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      placeholder="Etiqueta"
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
                    />
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={3}
                      placeholder="Contenido del mensaje"
                      className="resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={busyId === reply.id}
                        onClick={() => handleSaveEdit(reply.id)}
                        className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                      >
                        {busyId === reply.id && <Loader2 className="h-3 w-3 animate-spin" />}
                        Guardar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    key={reply.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background/50 px-3.5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{reply.label}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{reply.content}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(reply)}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                        aria-label={`Editar ${reply.label}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={busyId === reply.id}
                        onClick={() => handleDelete(reply.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-primary disabled:opacity-60"
                        aria-label={`Borrar ${reply.label}`}
                      >
                        {busyId === reply.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                ),
              )}
            </div>
          )}

          <form onSubmit={handleCreate} className="flex flex-col gap-2 border-t border-border pt-4">
            <span className="text-xs font-semibold text-muted-foreground">Nueva respuesta rápida</span>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Etiqueta (ej. Datos de pago)"
              className="rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
            />
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={3}
              placeholder="Contenido del mensaje que se va a insertar"
              className="resize-none rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
            />

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
