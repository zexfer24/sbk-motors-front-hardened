import { describe, expect, it } from "vitest"
import { computeCasheaTotalUsd, computeOrderTotals, sumItemsBs } from "@/lib/order-totals"

const RATE = 40 // Bs por USD, número redondo para que las cuentas sean legibles

describe("sumItemsBs", () => {
  it("sums price * quantity across items", () => {
    const items = [
      { price: 100, quantity: 2 },
      { price: 50, quantity: 1 },
    ]
    expect(sumItemsBs(items)).toBe(250)
  })

  it("returns 0 for an empty cart", () => {
    expect(sumItemsBs([])).toBe(0)
  })
})

describe("computeCasheaTotalUsd", () => {
  it("converts the cart to USD and rounds up to the business's favor", () => {
    // 3988.4 Bs / 40 = 99.71 USD -> redondea a 99.80
    const items = [{ price: 3988.4, quantity: 1 }]
    expect(computeCasheaTotalUsd(items, RATE)).toBeCloseTo(99.8, 10)
  })

  it("is 0 for an empty cart", () => {
    expect(computeCasheaTotalUsd([], RATE)).toBe(0)
  })
})

describe("computeOrderTotals", () => {
  it("charges the full cart for non-Cashea payment methods", () => {
    const items = [{ price: 4000, quantity: 1 }]
    const totals = computeOrderTotals({
      items,
      exchangeRate: RATE,
      isCashea: false,
      casheaInitialUsd: null,
    })
    expect(totals.totalBs).toBe(4000)
    expect(totals.totalUsd).toBe(100)
  })

  it("registers only the initial payment for Cashea orders, not the full cart", () => {
    const items = [{ price: 8000, quantity: 1 }] // full price: 200 USD
    const totals = computeOrderTotals({
      items,
      exchangeRate: RATE,
      isCashea: true,
      casheaInitialUsd: 50, // solo pagó la inicial hoy
    })
    expect(totals.totalUsd).toBe(50)
    expect(totals.totalBs).toBe(2000)
  })

  it("falls back to the cart total when Cashea has no initial payment recorded yet", () => {
    const items = [{ price: 4000, quantity: 1 }]
    const totals = computeOrderTotals({
      items,
      exchangeRate: RATE,
      isCashea: true,
      casheaInitialUsd: null,
    })
    expect(totals.totalBs).toBe(4000)
    expect(totals.totalUsd).toBe(100)
  })
})
