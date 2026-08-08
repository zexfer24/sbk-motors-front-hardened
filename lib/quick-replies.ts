export interface QuickReply {
  id: string
  label: string
  content: string
}

// Respuestas rápidas — el botón junto al mensaje las inserta en el
// cuadro de texto con un clic (el asesor puede editarlas antes de
// enviar). Edita este arreglo para dejar el contenido real de SBK
// Motors (datos de pago, políticas de envío, etc.).
export const QUICK_REPLIES: QuickReply[] = [
  {
    id: "datos-pago",
    label: "Datos de pago",
    content:
      "[Completa aquí los datos reales de pago de SBK Motors: Pago Móvil (banco, cédula/RIF, teléfono), Zelle, etc.]",
  },
]
