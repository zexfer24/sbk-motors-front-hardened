-- ============================================================================
-- SBK Motors · Notas de sistema del chat (mismo proyecto de Supabase que ya
-- usa Inventario/Ventas/Respuestas rápidas — ver lib/supabase/client.ts).
-- ============================================================================
-- Corre esto completo en el SQL Editor de tu proyecto de Supabase SOLO si
-- todavía no tienes la tabla `chat_system_events` creada.
--
-- Guarda el aviso de "fulano tomó/soltó esta conversación" con el nombre
-- real de quien lo hizo — reemplaza al aviso nativo de Chatwoot, que siempre
-- queda atribuido al dueño del token compartido de la API en vez de a quien
-- de verdad hizo clic en el panel (ver lib/api/chat-system-events.ts).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE chat_system_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   TEXT NOT NULL,
  content           TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_system_events_conversation ON chat_system_events (conversation_id, created_at);
