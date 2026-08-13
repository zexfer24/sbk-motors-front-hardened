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
-- Sin borrado ni edición a propósito: el pedido fue "que nunca se
-- reinicien" — la única forma de garantizar eso de verdad es no darle a la
-- UI ningún camino para borrar o pisar una nota ya escrita (ver
-- lib/api/chat-notes-store.ts). Es un log de bitácora, no un documento
-- editable.
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
