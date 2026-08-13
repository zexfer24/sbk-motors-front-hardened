import { NextResponse } from "next/server"
import { chatwootFetch, getChatwootConfig } from "@/lib/chatwoot/client"
import { invalidateConversationsCache } from "@/lib/api/chatwoot-sync"
import { guardConversationWrite } from "@/lib/chatwoot/authz"

type RouteContext = { params: Promise<{ id: string }> }

// Se dispara al confirmar el cierre de una venta: marca la conversación
// como resuelta (pasa a "Cerrados") y la desasigna del asesor (así, si el
// cliente vuelve a escribir, lo atiende la IA de nuevo hasta que se pida
// o se decida otra intervención).
export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params
  // Cerrar la venta de un compañero (sabotaje) era posible sin comprobación.
  const denied = await guardConversationWrite(request, id)
  if (denied) return denied

  const config = getChatwootConfig()

  if (config) {
    try {
      await chatwootFetch(`/conversations/${id}/toggle_status`, {
        method: "POST",
        body: JSON.stringify({ status: "resolved" }),
      })
    } catch {
      return NextResponse.json({ error: "error_chatwoot" }, { status: 502 })
    }

    try {
      await chatwootFetch(`/conversations/${id}/assignments`, {
        method: "POST",
        body: JSON.stringify({ assignee_id: null }),
      })
    } catch {
      // La conversación YA quedó resuelta en Chatwoot aunque esta segunda
      // llamada falle (no son atómicas) — invalidar caché igual, si no el
      // front puede seguir sirviendo el snapshot de antes por hasta 15s
      // mostrando la conversación como abierta/asignada cuando ya no lo
      // está. El error distinto le avisa al asesor que la venta sí se
      // registró como cerrada pero el chat quedó asignado, en vez de
      // dejarlo creer que no pasó nada.
      invalidateConversationsCache()
      return NextResponse.json(
        { error: "resuelta_pero_asignada", status: "resolved" },
        { status: 502 },
      )
    }

    // Ver el comentario de invalidateConversationsCache — mismo motivo
    // que en /intervene.
    invalidateConversationsCache()
    return NextResponse.json({ status: "resolved", handledBy: "ai" })
  }

  return NextResponse.json({ status: "resolved", handledBy: "ai" })
}
