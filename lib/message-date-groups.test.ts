import { describe, expect, it } from "vitest"
import { dateSeparatorLabel, dateSeparatorsFor } from "@/lib/message-date-groups"
import { caracasToday, caracasYesterday, shiftDateStr } from "@/lib/caracas-time"
import type { ChatwootMessage } from "@/lib/types/chatwoot"

function msg(id: string, createdAt: string): ChatwootMessage {
  return {
    id,
    content: "hola",
    messageType: "incoming",
    senderType: "customer",
    senderName: null,
    createdAt,
    attachments: [],
  }
}

describe("dateSeparatorLabel", () => {
  it("dice 'Hoy' para la fecha de hoy en Caracas", () => {
    expect(dateSeparatorLabel(caracasToday())).toBe("Hoy")
  })

  it("dice 'Ayer' para la fecha de ayer en Caracas", () => {
    expect(dateSeparatorLabel(caracasYesterday())).toBe("Ayer")
  })

  it("usa la fecha larga para cualquier otro día", () => {
    const oldDate = shiftDateStr(caracasToday(), -10)
    expect(dateSeparatorLabel(oldDate)).not.toBe("Hoy")
    expect(dateSeparatorLabel(oldDate)).not.toBe("Ayer")
    expect(dateSeparatorLabel(oldDate)).toMatch(/de \d{4}$/)
  })
})

describe("dateSeparatorsFor", () => {
  it("devuelve la etiqueta solo antes del primer mensaje de cada día, null en el resto", () => {
    const messages = [
      msg("1", "2026-08-10T23:20:00.000Z"), // 2026-08-10 19:20 Caracas
      msg("2", "2026-08-10T23:40:00.000Z"), // mismo día
      msg("3", "2026-08-12T14:00:00.000Z"), // día distinto (salto de más de un día)
    ]
    const labels = dateSeparatorsFor(messages)
    expect(labels[0]).not.toBeNull()
    expect(labels[1]).toBeNull()
    expect(labels[2]).not.toBeNull()
    expect(labels[0]).not.toBe(labels[2])
  })

  it("devuelve un arreglo vacío para una lista vacía", () => {
    expect(dateSeparatorsFor([])).toEqual([])
  })
})
