import { describe, expect, it } from "vitest"
import { formatDuration, trendPercent } from "@/lib/agent-stats-format"

describe("trendPercent", () => {
  it("returns the percent change between today and yesterday", () => {
    expect(trendPercent(12, 10)).toBe(20)
  })

  it("returns 100 when yesterday was 0 and today has activity", () => {
    expect(trendPercent(5, 0)).toBe(100)
  })

  it("returns null when both today and yesterday are 0 (no baseline to compare)", () => {
    expect(trendPercent(0, 0)).toBeNull()
  })
})

describe("formatDuration", () => {
  it("returns an em dash for null (sin dato)", () => {
    expect(formatDuration(null)).toBe("—")
  })

  it("formats under a minute in seconds", () => {
    expect(formatDuration(45)).toBe("45s")
  })

  it("formats under an hour in minutes", () => {
    expect(formatDuration(125)).toBe("2m")
  })

  it("formats an hour or more as 'Xh Ym'", () => {
    expect(formatDuration(3725)).toBe("1h 2m")
  })

  it("omits minutes when the duration is an exact number of hours", () => {
    expect(formatDuration(7200)).toBe("2h")
  })
})
