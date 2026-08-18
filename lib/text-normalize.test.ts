import { describe, expect, it } from "vitest"
import { normalizarTexto } from "@/lib/text-normalize"

describe("normalizarTexto", () => {
  it("quita tildes para que 'José' matchee 'jose'", () => {
    expect(normalizarTexto("José")).toBe("jose")
  })

  it("baja a minúsculas", () => {
    expect(normalizarTexto("JOSE")).toBe("jose")
  })

  it("no rompe texto que ya no tiene diacríticos", () => {
    expect(normalizarTexto("Cliente")).toBe("cliente")
  })

  it("quita varios tipos de diacríticos (tildes, diéresis, eñe)", () => {
    expect(normalizarTexto("Ñoño Muñiz Bäcker")).toBe("nono muniz backer")
  })
})
