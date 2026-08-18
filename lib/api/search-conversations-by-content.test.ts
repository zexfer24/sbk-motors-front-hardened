import { describe, expect, it, vi } from "vitest"
import { searchConversationsByContent, type SearchContentDeps } from "@/lib/api/search-conversations-by-content"

function makeDeps(ids: string[] | null): SearchContentDeps {
  return {
    searchConversationIdsByContent: vi.fn().mockResolvedValue(ids),
  }
}

describe("searchConversationsByContent", () => {
  it("no consulta la DB con menos de 3 caracteres (evita golpear la tabla en cada tecla)", async () => {
    const deps = makeDeps(["1", "2"])
    const result = await searchConversationsByContent("1", "jo", deps)
    expect(deps.searchConversationIdsByContent).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it("recorta espacios antes de decidir si alcanza el mínimo de 3 caracteres", async () => {
    const deps = makeDeps(["1"])
    const result = await searchConversationsByContent("1", "  jo  ", deps)
    expect(deps.searchConversationIdsByContent).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })

  it("consulta la DB con 3+ caracteres y devuelve los ids que matchean", async () => {
    const deps = makeDeps(["10", "12"])
    const result = await searchConversationsByContent("1", "cambio de repuesto", deps)
    expect(deps.searchConversationIdsByContent).toHaveBeenCalledWith("1", "cambio de repuesto")
    expect(result).toEqual(["10", "12"])
  })

  it("devuelve [] (no null) cuando la vía de DB no está disponible", async () => {
    const deps = makeDeps(null)
    const result = await searchConversationsByContent("1", "cambio de repuesto", deps)
    expect(result).toEqual([])
  })
})
