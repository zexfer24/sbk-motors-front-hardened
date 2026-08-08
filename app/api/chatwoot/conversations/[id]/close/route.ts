import { NextResponse } from "next/server"
import { chatwootFetch, getChatwootConfig } from "@/lib/chatwoot/client"
import { guardConversationRoute } from "@/lib/chatwoot/authz"

type RouteContext = { params: Promise<{ id: string }> }

// Se dispara al confirmar el cierre de una venta: marca la conversación
// como resuelta (pasa a "Cerrados") y la desasigna del asesor (así, si el
// cliente vuelve a escribir, lo atiende la IA de nuevo hasta que se pida
// o se decida otra intervención).
export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params
  // Cerrar la venta de un compañero (sabotaje) era posible sin comprobación.
  const denied = await guardConversationRoute(request, id)
  if (denied) return denied

  const config = getChatwootConfig()

  if (config) {
    try {
      await chatwootFetch(`/conversations/${id}/toggle_status`, {
        method: "POST",
        body: JSON.stringify({ status: "resolved" }),
      })
      await chatwootFetch(`/conversations/${id}/assignments`, {
        method: "POST",
        body: JSON.stringify({ assignee_id: null }),
      })
      return NextResponse.json({ status: "resolved", handledBy: "ai" })
    } catch {
      return NextResponse.json({ error: "error_chatwoot" }, { status: 502 })
    }
  }

  return NextResponse.json({ status: "resolved", handledBy: "ai" })
}
