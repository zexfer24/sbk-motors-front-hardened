import { NextResponse } from "next/server"
import { chatwootFetch, getChatwootConfig } from "@/lib/chatwoot/client"
import { invalidateConversationsCache } from "@/lib/api/chatwoot-sync"
import { guardConversationRead } from "@/lib/chatwoot/authz"

type RouteContext = { params: Promise<{ id: string }> }

// Asignación directa por un supervisor (admin) a cualquier asesor — a
// diferencia de /intervene (que siempre asigna al propio agente de quien
// llama), esto deja elegir explícitamente el destinatario. La ruta ya es
// admin-only a nivel de proxy.ts (ver isAdminOnlyApi), así que aquí solo
// queda validar el id y hacer la llamada a Chatwoot.
export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params
  const denied = await guardConversationRead(request, id)
  if (denied) return denied

  const body = await request.json().catch(() => null)
  const assigneeId = body && typeof body === "object" ? (body as Record<string, unknown>).assigneeId : undefined

  if (
    assigneeId !== null &&
    (typeof assigneeId !== "number" || !Number.isInteger(assigneeId) || assigneeId <= 0)
  ) {
    return NextResponse.json({ error: "asignado_invalido" }, { status: 400 })
  }

  const config = getChatwootConfig()
  if (config) {
    try {
      await chatwootFetch(`/conversations/${id}/assignments`, {
        method: "POST",
        body: JSON.stringify({ assignee_id: assigneeId }),
      })
      // Ver el comentario de invalidateConversationsCache — mismo motivo
      // que en /intervene.
      invalidateConversationsCache()
      return NextResponse.json({ assigneeId })
    } catch {
      return NextResponse.json({ error: "error_chatwoot" }, { status: 502 })
    }
  }

  return NextResponse.json({ assigneeId })
}
