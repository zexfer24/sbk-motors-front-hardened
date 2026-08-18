import { describe, expect, it, vi } from "vitest"
import { searchConversationsByContent, type SearchContentDeps } from "@/lib/api/search-conversations-by-content"

function makeDeps(matches: { conversationId: string; content: string }[] | null): SearchContentDeps {
  return {
    searchMessagesByContent: vi.fn().mockResolvedValue(matches),
  }
}

describe("searchConversationsByContent", () => {
  it("no consulta la DB con menos de 3 caracteres (evita golpear la tabla en cada tecla)", async () => {
    const deps = makeDeps([{ conversationId: "1", content: "cambio de repuesto" }])
    const result = await searchConversationsByContent("1", "jo", deps)
    expect(deps.searchMessagesByContent).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it("recorta espacios antes de decidir si alcanza el mínimo de 3 caracteres", async () => {
    const deps = makeDeps([{ conversationId: "1", content: "jo" }])
    const result = await searchConversationsByContent("1", "  jo  ", deps)
    expect(deps.searchMessagesByContent).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it("consulta la DB con 3+ caracteres y devuelve el snippet de cada match", async () => {
    const deps = makeDeps([
      { conversationId: "10", content: "hola quería consultar por el cambio de repuesto del motor" },
    ])
    const result = await searchConversationsByContent("1", "cambio de repuesto", deps)
    expect(deps.searchMessagesByContent).toHaveBeenCalledWith("1", "cambio de repuesto")
    expect(result).toEqual([
      { conversationId: "10", snippet: "hola quería consultar por el cambio de repuesto del motor" },
    ])
  })

  it("devuelve [] (no null) cuando la vía de DB no está disponible", async () => {
    const deps = makeDeps(null)
    const result = await searchConversationsByContent("1", "cambio de repuesto", deps)
    expect(result).toEqual([])
  })
})
