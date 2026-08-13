-- ============================================================================
-- SBK Motors · Log de auditoría de Ventas (PostgreSQL · mismo proyecto de
-- Supabase que ya usa orders — ver lib/supabase/client.ts).
-- ============================================================================
-- Corre esto completo en el SQL Editor de tu proyecto de Supabase SOLO si
-- todavía no tienes la tabla `order_events` creada.
--
-- Registra cada paso del ciclo de vida de una venta: cierre, solicitud de
-- devolución/confirmación por parte del asesor, ejecución real de esas
-- acciones por el admin, y eliminación. No tiene UPDATE/DELETE desde la
-- UI — es una bitácora, igual que chat_notes.
--
-- Sin FK con ON DELETE CASCADE a propósito: las ventas se borran de forma
-- lógica (orders.deleted_at, ver db/orders_schema.sql), nunca física, así
-- que el evento de "eliminada" queda registrado igual que los demás.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE order_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders (id),
  -- 'cierre' | 'solicitud_devolucion' | 'solicitud_confirmacion' |
  -- 'devolucion_ejecutada' | 'confirmacion_ejecutada' | 'eliminada'
  event_type    TEXT NOT NULL,
  actor_email   TEXT NOT NULL,
  actor_name    TEXT NOT NULL DEFAULT '',
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_events_order ON order_events (order_id, created_at);
