-- ============================================================================
-- SBK Motors · Notas privadas por cliente (mismo proyecto de Supabase que ya
-- usa Inventario/Ventas/Respuestas rápidas/Notas de sistema — ver
-- lib/supabase/client.ts).
-- ============================================================================
-- Corre esto completo en el SQL Editor de tu proyecto de Supabase SOLO si
-- todavía no tienes la tabla `chat_notes` creada.
--
-- Notas escritas a mano por asesores y administradores para compartir
-- información sobre un cliente (no de sistema, no automáticas). Se guardan
-- por CONTACTO de Chatwoot (contact_id), no por conversación — un mismo
-- cliente puede tener varias conversaciones a lo largo del tiempo (Chatwoot
-- abre una nueva cada vez que la anterior se resuelve) y las notas deben
-- verse en todas, no perderse cuando eso pasa.
--
-- Editar/borrar: cada quien solo puede tocar sus propias notas (ver la
-- migración de `updated_at` más abajo y lib/api/chat-notes-store.ts) — las
-- notas de otros siguen siendo de solo lectura para todos los demás.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE chat_notes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id    BIGINT NOT NULL,
  author_email  TEXT NOT NULL,
  content       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_notes_contact ON chat_notes (contact_id, created_at);

-- ============================================================================
-- MIGRACIÓN — editar/borrar notas (antes imposible a propósito). El negocio
-- pidió habilitarlo, restringido a que cada quien solo pueda tocar sus
-- propias notas — ver lib/api/chat-notes-store.ts (updateNote/deleteNote
-- filtran por author_email, no solo por id).
-- ============================================================================

ALTER TABLE chat_notes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
