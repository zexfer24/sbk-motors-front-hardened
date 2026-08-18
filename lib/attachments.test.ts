import { describe, expect, it } from "vitest"
import { MAX_ATTACHMENTS_PER_MESSAGE, removeAt, validateAttachmentCount } from "@/lib/attachments"

describe("validateAttachmentCount", () => {
  it("rechaza 0 archivos con 'archivo_requerido'", () => {
    expect(validateAttachmentCount(0)).toEqual({ ok: false, error: "archivo_requerido" })
  })

  it("acepta 1 archivo (caso de antes: una sola foto)", () => {
    expect(validateAttachmentCount(1)).toEqual({ ok: true })
  })

  it("acepta 10 archivos (el mínimo pedido explícitamente por el cliente)", () => {
    expect(validateAttachmentCount(10)).toEqual({ ok: true })
  })

  it(`acepta exactamente el techo (${MAX_ATTACHMENTS_PER_MESSAGE})`, () => {
    expect(validateAttachmentCount(MAX_ATTACHMENTS_PER_MESSAGE)).toEqual({ ok: true })
  })

  it("rechaza un archivo más que el techo con 'demasiados_archivos'", () => {
    expect(validateAttachmentCount(MAX_ATTACHMENTS_PER_MESSAGE + 1)).toEqual({
      ok: false,
      error: "demasiados_archivos",
    })
  })
})

describe("removeAt", () => {
  it("quita el elemento en el índice dado, preservando el orden del resto", () => {
    expect(removeAt(["a", "b", "c"], 1)).toEqual(["a", "c"])
  })

  it("devuelve null (no []) cuando el elemento quitado era el último que quedaba — señal para cerrar el modal", () => {
    expect(removeAt(["a"], 0)).toBeNull()
  })

  it("no muta el array original", () => {
    const original = ["a", "b"]
    removeAt(original, 0)
    expect(original).toEqual(["a", "b"])
  })
})
