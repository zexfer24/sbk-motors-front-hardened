'use client'

import { Image as ImageIcon, Loader2, SendHorizonal, X } from 'lucide-react'

interface ImagePreviewModalProps {
  imageUrl: string
  caption: string
  onCaptionChange: (value: string) => void
  sending: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}

// Antes, pegar o elegir una imagen la mandaba de una — sin chance de
// arrepentirse o agregarle un pie de foto antes de que el cliente la vea.
export function ImagePreviewModal({
  imageUrl,
  caption,
  onCaptionChange,
  sending,
  error,
  onCancel,
  onConfirm,
}: ImagePreviewModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Cancelar envío de imagen"
        onClick={onCancel}
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Previsualizar imagen"
        className="animate-blur-in relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl shadow-black/50"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
              <ImageIcon className="h-4 w-4" strokeWidth={2.5} />
            </span>
            <h2 className="heading-stamp text-sm text-foreground">Enviar imagen</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={sending}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
            aria-label="Cancelar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex items-center justify-center overflow-hidden rounded-lg border border-border bg-background/50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="Previsualización" className="max-h-80 w-full object-contain" />
          </div>

          {error && (
            <p role="alert" className="mt-3 text-xs text-primary">
              {error}
            </p>
          )}

          <textarea
            value={caption}
            onChange={(e) => onCaptionChange(e.target.value)}
            placeholder="Agrega un pie de foto (opcional)…"
            rows={2}
            className="mt-3 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-shadow focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={sending}
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={sending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform active:scale-95 disabled:opacity-60"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
            Enviar
          </button>
        </div>
      </div>
    </div>
  )
}
