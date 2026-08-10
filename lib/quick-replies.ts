// Respuestas rápidas — el botón junto al mensaje las inserta en el cuadro
// de texto con un clic (el asesor puede editarlas antes de enviar). Antes
// vivían como un arreglo fijo aquí mismo; ahora se administran desde la
// propia burbuja de respuestas rápidas del chat y se guardan en el
// servidor (ver app/api/quick-replies, lib/hooks/use-quick-replies.ts) —
// este archivo solo deja el tipo.
export interface QuickReply {
  id: string
  label: string
  content: string
}
