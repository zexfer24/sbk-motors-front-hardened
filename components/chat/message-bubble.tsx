'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Bot, Check, CheckCheck, Download, File, Paperclip, Play, User, X } from 'lucide-react'
import type { ChatwootAttachment, ChatwootMessage } from '@/lib/types/chatwoot'
import { cn } from '@/lib/utils'

// Fuerza la descarga real del archivo en vez de dejar que el navegador solo
// lo abra/muestre (que es lo único que hace un <a href> normal con un
// adjunto de otro origen — el atributo `download` HTML se ignora entre
// orígenes distintos). Si el adjunto no se puede leer por fetch (CORS,
// caído, lo que sea), se degrada a abrirlo en pestaña nueva — al menos
// ahí se puede "Guardar como" a mano.
async function downloadAttachment(attachment: ChatwootAttachment) {
  const filename = attachment.fileUrl.split('/').pop()?.split('?')[0] || 'adjunto'
  try {
    const res = await fetch(attachment.fileUrl)
    if (!res.ok) throw new Error('descarga_fallida')
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(objectUrl)
  } catch {
    window.open(attachment.fileUrl, '_blank', 'noopener,noreferrer')
  }
}

function DownloadButton({
  attachment,
  className,
}: {
  attachment: ChatwootAttachment
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        downloadAttachment(attachment)
      }}
      aria-label="Descargar adjunto"
      title="Descargar"
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/70 hover:text-white',
        className,
      )}
    >
      <Download className="h-3.5 w-3.5" />
    </button>
  )
}

const senderLabels: Record<string, string> = {
  customer: '',
  ai: 'Asistente IA',
  human: 'Asesor',
}

export function MessageBubble({ message }: { message: ChatwootMessage }) {
  const isCustomer = message.messageType === 'incoming'
  const isAi = message.senderType === 'ai'
  const isHuman = message.senderType === 'human'
  const [lightbox, setLightbox] = useState<ChatwootAttachment | null>(null)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      className={cn('flex w-full', isCustomer ? 'justify-start' : 'justify-end')}
    >
      <div className="flex max-w-[78%] flex-col gap-1 sm:max-w-[65%]">
        {!isCustomer && (
          <span
            className={cn(
              'flex items-center gap-1 self-end text-[0.65rem] font-medium uppercase tracking-wider',
              isAi ? 'text-success' : 'text-warning',
            )}
          >
            {isAi ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
            {message.senderName ?? senderLabels[message.senderType]}
          </span>
        )}
        <div
          className={cn(
            'rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-[0_1px_0_0_oklch(0_0_0/0.3)]',
            isCustomer &&
              'rounded-bl-sm border border-border bg-secondary text-foreground',
            isAi &&
              'rounded-br-sm border border-success/30 bg-success/10 text-foreground',
            isHuman &&
              'rounded-br-sm border border-warning/30 bg-warning/10 text-foreground',
          )}
        >
          {message.content && <p className="text-pretty">{message.content}</p>}

          {message.attachments.length > 0 && (
            <div className={cn('flex flex-wrap gap-2', message.content && 'mt-2')}>
              {message.attachments.map((att) => (
                <AttachmentPreview
                  key={att.id}
                  attachment={att}
                  onExpand={() => setLightbox(att)}
                />
              ))}
            </div>
          )}

          <div className="mt-1 flex items-center justify-end gap-1">
            <span className="font-mono text-[0.6rem] text-muted-foreground">
              {formatTime(message.createdAt)}
            </span>
            {!isCustomer && message.status && (
              <span
                className={cn(
                  message.status === 'read'
                    ? 'text-[oklch(0.72_0.15_220)]'
                    : 'text-muted-foreground',
                )}
              >
                {message.status === 'sent' ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <CheckCheck className="h-3 w-3" />
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="absolute right-4 top-4 flex items-center gap-2">
            <DownloadButton attachment={lightbox} className="h-9 w-9 bg-black/40 hover:bg-black/60" />
            <button
              type="button"
              onClick={() => setLightbox(null)}
              className="rounded-full bg-black/40 p-2 text-white/80 hover:text-white"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {lightbox.kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={lightbox.fileUrl}
              alt="Adjunto"
              className="max-h-full max-w-full rounded-lg object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <video
              src={lightbox.fileUrl}
              controls
              autoPlay
              className="max-h-full max-w-full rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}
    </motion.div>
  )
}

function AttachmentPreview({
  attachment,
  onExpand,
}: {
  attachment: ChatwootAttachment
  onExpand: () => void
}) {
  // Chatwoot manda una miniatura liviana aparte del archivo completo — sin
  // esto, cada preview inline del chat descargaba la imagen a resolución
  // completa (varios MB si viene de una cámara de celular), lo que en una
  // conexión lenta se sentía como "no carga". Si la miniatura falla, cae a
  // la imagen completa en vez de quedarse rota.
  const [thumbFailed, setThumbFailed] = useState(false)

  if (attachment.kind === 'image') {
    const previewSrc = attachment.thumbUrl && !thumbFailed ? attachment.thumbUrl : attachment.fileUrl
    return (
      <div className="relative">
        <button
          type="button"
          onClick={onExpand}
          className="block overflow-hidden rounded-lg border border-border transition-opacity hover:opacity-90"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewSrc}
            alt="Imagen adjunta"
            loading="lazy"
            onError={() => setThumbFailed(true)}
            className="max-h-56 w-auto max-w-[220px] object-cover"
          />
        </button>
        <DownloadButton attachment={attachment} className="absolute right-1.5 top-1.5" />
      </div>
    )
  }

  if (attachment.kind === 'video') {
    return (
      <div className="relative max-w-[240px]">
        <button
          type="button"
          onClick={onExpand}
          className="block overflow-hidden rounded-lg border border-border"
        >
          <video
            src={attachment.fileUrl}
            className="max-h-56 w-full object-cover"
            preload="metadata"
            muted
          />
          {/* preload="metadata" no siempre pinta un frame visible antes de
              reproducir — sin este ícono, un video sin frame se ve como un
              recuadro negro vacío, indistinguible de uno roto. */}
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white">
              <Play className="h-4 w-4 translate-x-0.5" fill="currentColor" />
            </span>
          </span>
        </button>
        <DownloadButton attachment={attachment} className="absolute right-1.5 top-1.5" />
      </div>
    )
  }

  if (attachment.kind === 'audio') {
    return (
      <div className="flex w-full min-w-[220px] max-w-[260px] items-center gap-1.5">
        <audio src={attachment.fileUrl} controls preload="metadata" className="h-10 flex-1" />
        <DownloadButton
          attachment={attachment}
          className="static h-8 w-8 shrink-0 bg-secondary text-muted-foreground hover:bg-secondary hover:text-foreground"
        />
      </div>
    )
  }

  return (
    <a
      href={attachment.fileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 rounded-md border border-border bg-background/50 px-2 py-1 text-[0.65rem] text-muted-foreground hover:text-foreground"
    >
      {attachment.fileType === 'file' ? (
        <File className="h-3 w-3" />
      ) : (
        <Paperclip className="h-3 w-3" />
      )}
      <span className="truncate max-w-[120px]">{attachment.fileUrl.split('/').pop()}</span>
    </a>
  )
}

function formatTime(iso: string) {
  const date = new Date(iso)
  return date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
}
