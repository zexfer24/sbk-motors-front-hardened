import { NextResponse } from "next/server"
import { getChatwootConfig } from "@/lib/chatwoot/client"
import { getConversationLabels, setConversationLabels } from "@/lib/chatwoot/labels"
import { invalidateConversationsCache } from "@/lib/api/chatwoot-sync"
import { guardConversationRead, guardConversationWrite } from "@/lib/chatwoot/authz"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params
  const denied = await guardConversationRead(request, id)
  if (denied) return denied

  if (!getChatwootConfig()) return NextResponse.json({ labels: [] })

  try {
    const labels = await getConversationLabels(id)
    return NextResponse.json({ labels })
  } catch {
    return NextResponse.json({ error: "error_chatwoot" }, { status: 502 })
  }
}

// Etiquetar queda dentro del mismo perímetro que mandar un mensaje — admin o
// quien tiene la conversación asignada — para que no cualquiera reetiquete
// el chat de un compañero.
export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params
  const denied = await guardConversationWrite(request, id)
  if (denied) return denied

  const body = await request.json().catch(() => null)
  const labels =
    body && Array.isArray(body.labels)
      ? body.labels.filter((l: unknown): l is string => typeof l === "string")
      : null
  if (!labels) return NextResponse.json({ error: "etiquetas_invalidas" }, { status: 400 })

  if (!getChatwootConfig()) return NextResponse.json({ labels })

  try {
    const result = await setConversationLabels(id, labels)
    // Ver el comentario de invalidateConversationsCache — mismo motivo
    // que en /intervene.
    invalidateConversationsCache()
    return NextResponse.json({ labels: result })
  } catch {
    return NextResponse.json({ error: "error_chatwoot" }, { status: 502 })
  }
}
