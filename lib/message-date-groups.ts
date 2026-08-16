// ============================================================================
// Separadores de fecha del historial de chat — agrupa mensajes ya cargados
// por día calendario en horario Caracas (lib/caracas-time.ts, la misma
// zona que usa el resto de la app), estilo Chatwoot nativo. Separado de
// components/chat/chat-panel.tsx para poder probarlo sin renderizar React.
// ============================================================================

import { caracasDateStr, caracasFormatShort, caracasToday, caracasYesterday } from "@/lib/caracas-time"
import type { ChatwootMessage } from "@/lib/types/chatwoot"

export function dateSeparatorLabel(dateStr: string): string {
  if (dateStr === caracasToday()) return "Hoy"
  if (dateStr === caracasYesterday()) return "Ayer"
  return caracasFormatShort(dateStr)
}

// Para cada mensaje de `messages` (se asume ya en orden cronológico
// ascendente, el mismo orden en que llegan de mergeSystemEvents/la API),
// devuelve la etiqueta a mostrar ANTES de ese mensaje si es el primero de
// su día en la tanda cargada — o null si comparte día con el anterior.
export function dateSeparatorsFor(messages: ChatwootMessage[]): (string | null)[] {
  let lastDay: string | null = null
  return messages.map((m) => {
    const day = caracasDateStr(new Date(m.createdAt))
    if (day === lastDay) return null
    lastDay = day
    return dateSeparatorLabel(day)
  })
}
