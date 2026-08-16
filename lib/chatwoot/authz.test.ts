import { describe, expect, it } from "vitest"
import { canWriteAssignee } from "@/lib/chatwoot/authz"

// 2026-08-16 (pedido explícito del negocio): un incidente en n8n reasignó
// conversaciones a la persona equivocada y la regla anterior (solo escribe
// quien la tiene asignada) bloqueaba con 403 al asesor real que necesitaba
// responderle a su propio cliente. Se saca la restricción del todo — la
// lectura ya era libre para todo el equipo, ahora la escritura también.
describe("canWriteAssignee — cualquier autenticado puede escribir, sin importar la asignación", () => {
  it("siempre devuelve true", () => {
    expect(canWriteAssignee()).toBe(true)
  })
})
