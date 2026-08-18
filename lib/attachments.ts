// ============================================================================
// Helpers puros para el envío de varias fotos en un solo mensaje (2026-08-18,
// pedido del cliente) — separados del componente (ImagePreviewModal /
// chat-panel.tsx) y de la ruta de subida
// (app/api/chatwoot/conversations/[id]/messages/route.ts) para poder
// probarlos sin renderizar React ni mockear FormData/Request de Next.
// ============================================================================

// Techo defensivo, no una limitación real del backend de Chatwoot (que ya
// itera `@attachments.each` sin un tope propio, ver message_builder.rb) —
// solo para no dejar que un solo POST intente subir un número absurdo de
// archivos. Bien por encima del "10 o más" pedido por el cliente.
export const MAX_ATTACHMENTS_PER_MESSAGE = 30

export type AttachmentCountValidation = { ok: true } | { ok: false; error: string }

export function validateAttachmentCount(count: number): AttachmentCountValidation {
  if (count === 0) return { ok: false, error: "archivo_requerido" }
  if (count > MAX_ATTACHMENTS_PER_MESSAGE) return { ok: false, error: "demasiados_archivos" }
  return { ok: true }
}

// Quita el elemento en `index` de un lote de previsualización (ver
// ImagePreviewModal) — devuelve `null` en vez de un array vacío cuando era
// el último que quedaba, así el caller puede usar eso directo como señal de
// "cerrar el modal" sin tener que chequear `.length === 0` aparte.
export function removeAt<T>(items: T[], index: number): T[] | null {
  const next = items.filter((_, i) => i !== index)
  return next.length > 0 ? next : null
}
