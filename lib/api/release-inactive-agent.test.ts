import { describe, expect, it, vi } from "vitest"
import {
  releaseUnansweredConversations,
  selectUnansweredConversationIds,
  type ReleaseDeps,
} from "@/lib/api/release-inactive-agent"

describe("selectUnansweredConversationIds", () => {
  it("keeps conversations with unread messages and drops the ones already answered", () => {
    const ids = selectUnansweredConversationIds([
      { id: "1", unreadCount: 2 },
      { id: "2", unreadCount: 0 },
      { id: "3", unreadCount: 1 },
    ])
    expect(ids).toEqual(["1", "3"])
  })
})

function makeDeps(rows: { id: string; unreadCount: number }[] | null): ReleaseDeps {
  return {
    fetchAssignedConversations: vi.fn().mockResolvedValue(rows),
    unassign: vi.fn().mockResolvedValue(undefined),
    recordNote: vi.fn().mockResolvedValue(undefined),
    invalidateCache: vi.fn(),
  }
}

describe("releaseUnansweredConversations", () => {
  it("unassigns and notes only the unanswered conversations, then invalidates the cache once", async () => {
    const deps = makeDeps([
      { id: "10", unreadCount: 3 },
      { id: "11", unreadCount: 0 },
      { id: "12", unreadCount: 1 },
    ])

    const result = await releaseUnansweredConversations("Juana Pérez", deps)

    expect(deps.unassign).toHaveBeenCalledTimes(2)
    expect(deps.unassign).toHaveBeenCalledWith("10")
    expect(deps.unassign).toHaveBeenCalledWith("12")
    expect(deps.unassign).not.toHaveBeenCalledWith("11")
    expect(deps.recordNote).toHaveBeenCalledTimes(2)
    expect(deps.invalidateCache).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ liberadas: 2, errores: 0 })
  })

  it("does not touch an already-answered conversation", async () => {
    const deps = makeDeps([{ id: "20", unreadCount: 0 }])

    const result = await releaseUnansweredConversations("Juana Pérez", deps)

    expect(deps.unassign).not.toHaveBeenCalled()
    expect(deps.recordNote).not.toHaveBeenCalled()
    expect(deps.invalidateCache).not.toHaveBeenCalled()
    expect(result).toEqual({ liberadas: 0, errores: 0 })
  })

  it("keeps going when one release fails, and still counts the rest", async () => {
    const deps = makeDeps([
      { id: "30", unreadCount: 1 },
      { id: "31", unreadCount: 1 },
    ])
    ;(deps.unassign as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("chatwoot caído")
    })

    const result = await releaseUnansweredConversations("Juana Pérez", deps)

    expect(result).toEqual({ liberadas: 1, errores: 1 })
    expect(deps.unassign).toHaveBeenCalledTimes(2)
    expect(deps.invalidateCache).toHaveBeenCalledTimes(1)
  })

  it("returns zero without touching anything when there is nothing to fetch", async () => {
    const deps = makeDeps(null)

    const result = await releaseUnansweredConversations("Juana Pérez", deps)

    expect(result).toEqual({ liberadas: 0, errores: 0 })
    expect(deps.unassign).not.toHaveBeenCalled()
    expect(deps.invalidateCache).not.toHaveBeenCalled()
  })
})
