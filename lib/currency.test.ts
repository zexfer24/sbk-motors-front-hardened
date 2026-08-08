import { describe, expect, it } from "vitest"
import { bsToUsd, formatBs, formatUsd, roundUpToDime } from "@/lib/currency"

describe("bsToUsd", () => {
  it("converts Bolivares to dollars at the given rate", () => {
    expect(bsToUsd(100, 50)).toBe(2)
  })

  it("returns 0 when the rate is 0 (avoids dividing by zero)", () => {
    expect(bsToUsd(100, 0)).toBe(0)
  })
})

describe("roundUpToDime", () => {
  // Regla del negocio: Cashea redondea a favor de la empresa, siempre
  // hacia arriba al décimo de dólar más cercano.
  it.each([
    [99.71, 99.8],
    [76.41, 76.5],
    [12.18, 12.2],
    [12.01, 12.1],
  ])("rounds %f up to %f", (input, expected) => {
    expect(roundUpToDime(input)).toBeCloseTo(expected, 10)
  })

  it("leaves an exact dime unchanged", () => {
    expect(roundUpToDime(50.3)).toBeCloseTo(50.3, 10)
  })

  it("rounds 0 to 0", () => {
    expect(roundUpToDime(0)).toBe(0)
  })
})

describe("formatUsd / formatBs", () => {
  it("formats USD with two decimals and the US$ prefix", () => {
    expect(formatUsd(1234.5)).toBe("US$ 1,234.50")
  })

  it("formats Bs with two decimals and the Bs prefix", () => {
    expect(formatBs(1234.5)).toBe("Bs 1.234,50")
  })
})
