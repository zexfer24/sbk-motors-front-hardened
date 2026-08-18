import { describe, expect, it } from "vitest"
import { mapRow } from "@/lib/api/chatwoot-db"

// Fila mínima válida de CONVERSATIONS_QUERY — cada test pisa solo lo que le
// importa, igual que rawConversation() en chatwoot-sync.test.ts.
function row(overrides: Partial<Parameters<typeof mapRow>[0]> = {}): Parameters<typeof mapRow>[0] {
  return {
    id: 74,
    status: 0,
    created_at: "2026-08-12T19:00:00.000Z",
    labels_raw: null,
    inbox_id: 1,
    inbox_name: "WhatsApp Principal",
    contact_id: 1,
    contact_name: "Cliente",
    phone: "+51907642897",
    assignee_id: null,
    assignee_name: null,
    last_message: "hola",
    last_message_at: "2026-08-12T19:05:00.000Z",
    last_message_type: null,
    last_message_status: null,
    unread_count: 0,
    ...overrides,
  }
}

describe("mapRow — lastMessageStatus (check/doble check de la miniatura, vía Postgres directo)", () => {
  it("expone el status normalizado cuando el último mensaje (message_type=1) es saliente", () => {
    expect(mapRow(row({ last_message_type: 1, last_message_status: "read" })).lastMessageStatus).toBe("read")
  })

  it("es null cuando el último mensaje es del cliente (message_type=0)", () => {
    expect(mapRow(row({ last_message_type: 0, last_message_status: "read" })).lastMessageStatus).toBeNull()
  })

  it("es null cuando no hay ningún mensaje todavía (lm no matcheó, message_type null)", () => {
    expect(mapRow(row({ last_message_type: null, last_message_status: null })).lastMessageStatus).toBeNull()
  })

  it("un status desconocido en el último saliente cae a 'sent' vía normalizeMessageStatus", () => {
    expect(mapRow(row({ last_message_type: 1, last_message_status: "failed" })).lastMessageStatus).toBe("sent")
  })
})

describe("mapRow — otros campos básicos (sin cobertura previa)", () => {
  it("parsea cached_label_list (CSV) en un array de labels sin espacios sobrantes", () => {
    expect(mapRow(row({ labels_raw: "urgente, seguimiento ,vip" })).labels).toEqual([
      "urgente",
      "seguimiento",
      "vip",
    ])
  })

  it("labels_raw null da un array vacío, no [null] ni [\"\"]", () => {
    expect(mapRow(row({ labels_raw: null })).labels).toEqual([])
  })

  it("assigneeName es null cuando no hay assignee, aunque assignee_name viniera con algo por error de datos", () => {
    expect(mapRow(row({ assignee_id: null, assignee_name: "sobrante" })).assigneeName).toBeNull()
  })

  it("handledBy es 'human' con assignee y 'ai' sin asignar — mismo criterio que el path por API", () => {
    expect(mapRow(row({ assignee_id: 5, assignee_name: "Jose" })).handledBy).toBe("human")
    expect(mapRow(row({ assignee_id: null })).handledBy).toBe("ai")
  })
})
