import { NextResponse } from "next/server"
import { markAsRead } from "@/lib/api/chatwoot-demo-store"
import { chatwootFetch, getChatwootConfig } from "@/lib/chatwoot/client"
import { guardConversationRoute } from "@/lib/chatwoot/authz"

type RouteContext = { params: Promise<{ id: string }> }

// Marca la conversación como leída en Chatwoot de verdad (actualiza
// agent_last_seen_at ahí) — no solo en el estado local del front. Si
// solo lo marcáramos localmente, el contador real de Chatwoot seguiría
// mostrando los mismos mensajes sin leer la próxima vez que se recargue
// la página o se salga y vuelva a entrar a la pestaña de WhatsApp.
export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params
  const denied = await guardConversationRoute(request, id)
  if (denied) return denied

  const config = getChatwootConfig()

  if (config) {
    try {
      await chatwootFetch(`/conversations/${id}/update_last_seen`, { method: "POST" })
      return NextResponse.json({ ok: true })
    } catch {
      return NextResponse.json({ error: "error_chatwoot" }, { status: 502 })
    }
  }

  markAsRead(id)
  return NextResponse.json({ ok: true })
}
