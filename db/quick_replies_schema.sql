-- ============================================================================
-- SBK Motors · Esquema de respuestas rápidas (mismo proyecto de Supabase
-- que ya usa Inventario/Ventas — ver lib/supabase/client.ts).
-- ============================================================================
-- Corre esto completo en el SQL Editor de tu proyecto de Supabase SOLO si
-- todavía no tienes la tabla `quick_replies` creada.
--
-- Antes estas respuestas vivían como un arreglo fijo en el código
-- (lib/quick-replies.ts) — solo un desarrollador podía cambiarlas. Ahora se
-- administran desde la propia burbuja de respuestas rápidas del chat (solo
-- admin puede crear/editar/borrar — ver proxy.ts) y quedan disponibles al
-- instante en cualquier chat, de cualquier asesor.
-- ============================================================================

CREATE TABLE quick_replies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label       TEXT NOT NULL,
  content     TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE INDEX idx_quick_replies_sort_order ON quick_replies (sort_order, created_at);

-- Semilla opcional — la misma respuesta de ejemplo que traía el arreglo
-- fijo antes. Bórrala o edítala desde la UI en cuanto tengas los datos
-- reales de pago de SBK Motors.
INSERT INTO quick_replies (label, content, sort_order) VALUES (
  'Datos de pago',
  '[Completa aquí los datos reales de pago de SBK Motors: Pago Móvil (banco, cédula/RIF, teléfono), Zelle, etc.]',
  0
);
