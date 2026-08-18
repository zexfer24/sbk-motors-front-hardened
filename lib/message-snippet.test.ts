import { describe, expect, it } from "vitest"
import { buildSnippet } from "@/lib/message-snippet"

describe("buildSnippet", () => {
  it("recorta con '…' de ambos lados cuando la frase está en medio de un texto largo", () => {
    const content =
      "Buenas tardes, quería consultar por el cambio de repuesto del motor porque se me rompió ayer en la carretera"
    const snippet = buildSnippet(content, "cambio de repuesto", 15)
    expect(snippet).toBe("…nsultar por el cambio de repuesto del motor porq…")
  })

  it("no agrega '…' al inicio cuando la frase está al principio del mensaje", () => {
    const content = "Cambio de repuesto necesito para mi moto urgente por favor"
    const snippet = buildSnippet(content, "cambio de repuesto", 10)
    expect(snippet).toBe("Cambio de repuesto necesito…")
  })

  it("no agrega '…' al final cuando la frase está al final del mensaje", () => {
    const content = "hola quería preguntar por el cambio de repuesto"
    const snippet = buildSnippet(content, "cambio de repuesto", 10)
    expect(snippet).toBe("…ar por el cambio de repuesto")
  })

  it("devuelve el contenido tal cual (sin '…') cuando entra completo dentro de la ventana", () => {
    const content = "cambio de repuesto"
    expect(buildSnippet(content, "cambio de repuesto", 40)).toBe("cambio de repuesto")
  })

  it("es case-insensitive: encuentra 'CAMBIO DE REPUESTO' buscando 'cambio de repuesto'", () => {
    const content = "Consulta por CAMBIO DE REPUESTO del motor, gracias"
    const snippet = buildSnippet(content, "cambio de repuesto", 10)
    expect(snippet).toBe("…sulta por CAMBIO DE REPUESTO del motor…")
  })

  it("si la frase no aparece en el contenido, devuelve el contenido sin tocar (fallback)", () => {
    const content = "hola, buenos días"
    expect(buildSnippet(content, "cambio de repuesto", 10)).toBe(content)
  })
})
