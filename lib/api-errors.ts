// ============================================================================
// Respuestas de error de las rutas /api/* — sin filtrar detalles internos.
// ============================================================================
// Antes varias rutas devolvían `detail: error.message` con el mensaje crudo
// de Supabase/PostgREST. Esos mensajes nombran tablas, columnas, tipos y
// restricciones: para un atacante autenticado son un mapa del esquema, y
// combinados con un filtro manipulable sirven de oráculo para enumerarlo.
//
// Ahora el detalle se escribe en el log del servidor (donde sí lo quieres,
// para depurar) y al cliente solo le llega un código estable.
// ============================================================================

import { NextResponse } from "next/server"

// Códigos que el front ya conoce — no se renombran para no romper la UI.
type ErrorCode = "error_supabase" | "error_tasa_bcv" | "error_chatwoot"

export function serverError(code: ErrorCode, context: string, cause: unknown, status = 500) {
  const detail =
    cause instanceof Error
      ? cause.message
      : typeof cause === "object" && cause !== null && "message" in cause
        ? String((cause as { message: unknown }).message)
        : String(cause)

  // Solo al log del servidor. Nunca al cuerpo de la respuesta.
  console.error(`[api] ${context}: ${detail}`)

  return NextResponse.json({ error: code }, { status })
}
