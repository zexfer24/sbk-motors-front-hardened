import { describe, expect, it } from "vitest"
import { caracasFormatShort, caracasWorkHoursBoundsUtc } from "@/lib/caracas-time"

describe("caracasWorkHoursBoundsUtc", () => {
  it("uses 8:30am-7:30pm Caracas (UTC-4) for a weekday", () => {
    // 2026-08-12 es miércoles.
    const bounds = caracasWorkHoursBoundsUtc("2026-08-12")
    expect(bounds.startUtc).toBe("2026-08-12T12:30:00.000Z")
    expect(bounds.endUtc).toBe("2026-08-12T23:30:00.000Z")
  })

  it("uses 8:30am-7:30pm Caracas for a Saturday", () => {
    // 2026-08-15 es sábado.
    const bounds = caracasWorkHoursBoundsUtc("2026-08-15")
    expect(bounds.startUtc).toBe("2026-08-15T12:30:00.000Z")
    expect(bounds.endUtc).toBe("2026-08-15T23:30:00.000Z")
  })

  it("uses the shorter 9am-4:30pm window for Sunday", () => {
    // 2026-08-16 es domingo.
    const bounds = caracasWorkHoursBoundsUtc("2026-08-16")
    expect(bounds.startUtc).toBe("2026-08-16T13:00:00.000Z")
    expect(bounds.endUtc).toBe("2026-08-16T20:30:00.000Z")
  })
})

describe("caracasFormatShort", () => {
  it("formats as 'D de mes de AAAA' sin día de la semana, para separadores de fecha del chat", () => {
    expect(caracasFormatShort("2026-08-10")).toBe("10 de agosto de 2026")
  })
})
