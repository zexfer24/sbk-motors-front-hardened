import { NextResponse } from "next/server"
import { getChatwootConfig } from "@/lib/chatwoot/client"
import { searchMessagesByContent } from "@/lib/api/chatwoot-db"
import { searchConversationsByContent } from "@/lib/api/search-conversations-by-content"

// Buscador de la bandeja de WhatsApp por CONTENIDO de mensajes (no solo
// nombre/teléfono) — ver lib/api/search-conversations-by-content.ts (gate de
// 3+ caracteres, snippet vía buildSnippet) y lib/api/chatwoot-db.ts (consulta
// SQL sobre la tabla `messages`, rol de solo lectura sbk_front_ro). Sin guard
// por-conversación: esta ruta no es sobre un id puntual, así que la
// autorización general de proxy.ts para todo /api/chatwoot/* ya alcanza —
// mismo criterio que GET /api/chatwoot/conversations.
export async function GET(request: Request) {
  const config = getChatwootConfig()
  if (!config) {
    // Modo demo: no hay Postgres real de Chatwoot que consultar.
    return NextResponse.json({ matches: [] })
  }

  const q = new URL(request.url).searchParams.get("q") ?? ""
  const matches = await searchConversationsByContent(config.accountId, q, {
    searchMessagesByContent,
  })
  return NextResponse.json({ matches })
}
