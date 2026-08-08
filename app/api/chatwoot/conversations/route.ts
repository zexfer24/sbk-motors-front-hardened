import { NextResponse } from "next/server"
import { listConversations } from "@/lib/api/chatwoot-demo-store"
import { getChatwootConfig } from "@/lib/chatwoot/client"
import { fetchAndSyncConversations } from "@/lib/api/chatwoot-sync"
import { CHATWOOT_AGENT_ID_HEADER, USER_ROLE_HEADER } from "@/lib/auth-headers"

export async function GET(request: Request) {
  const config = getChatwootConfig()

  if (config) {
    const result = await fetchAndSyncConversations()
    if (!result.ok) {
      return NextResponse.json({ error: "error_chatwoot" }, { status: 502 })
    }

    // Un asesor solo necesita ver sus propios chats y los que todavía no
    // tienen dueño (para poder tomarlos) — no los de sus compañeros. Los
    // admin (dueños/supervisor) siguen viendo todo, como antes.
    //
    // Falla CERRADO: antes la condición era `role === "asesor" && agentId
    // !== null`, así que un asesor sin `chatwoot_agent_id` vinculado caía al
    // `else` y veía TODAS las conversaciones de la empresa. Ahora solo se
    // ensancha la vista para admin; cualquier otro caso filtra, y un asesor
    // sin agente vinculado ve únicamente las no asignadas.
    const role = request.headers.get(USER_ROLE_HEADER)
    const agentIdHeader = request.headers.get(CHATWOOT_AGENT_ID_HEADER)
    const agentId =
      agentIdHeader && /^[0-9]{1,18}$/.test(agentIdHeader) ? Number(agentIdHeader) : null

    const conversations =
      role === "admin"
        ? result.conversations
        : result.conversations.filter(
            (c) => c.assigneeId === null || (agentId !== null && c.assigneeId === agentId),
          )

    return NextResponse.json({ conversations, source: "chatwoot" })
  }

  return NextResponse.json({ conversations: listConversations(), source: "demo" })
}
