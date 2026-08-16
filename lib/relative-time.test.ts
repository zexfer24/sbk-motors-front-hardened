import { describe, expect, it } from "vitest"
import { formatRelativeTime } from "@/lib/relative-time"

const now = new Date("2026-08-16T12:00:00.000Z")

describe("formatRelativeTime", () => {
  it("returns an empty string for null (sin mensajes todavía)", () => {
    expect(formatRelativeTime(null, now)).toBe("")
  })

  it("says 'ahora' for under a minute ago", () => {
    expect(formatRelativeTime("2026-08-16T11:59:30.000Z", now)).toBe("ahora")
  })

  it("shows minutes for under an hour ago", () => {
    expect(formatRelativeTime("2026-08-16T11:45:00.000Z", now)).toBe("15min")
  })

  it("shows hours for under a day ago", () => {
    expect(formatRelativeTime("2026-08-16T09:00:00.000Z", now)).toBe("3h")
  })

  it("says 'ayer' for exactly one day ago", () => {
    expect(formatRelativeTime("2026-08-15T12:00:00.000Z", now)).toBe("ayer")
  })

  it("falls back to a short date for two or more days ago", () => {
    expect(formatRelativeTime("2026-08-10T12:00:00.000Z", now)).toBe(
      new Date("2026-08-10T12:00:00.000Z").toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" }),
    )
  })
})
