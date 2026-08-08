-- ============================================================================
-- SBK Motors · Row Level Security — estado verificado el 2026-08-08
-- ============================================================================
-- Este archivo existe porque la postura de seguridad de la base de datos NO
-- estaba en el repo: RLS se activó desde el dashboard de Supabase, así que
-- ningún archivo de db/ la reproducía. Consecuencia práctica: un entorno
-- reconstruido desde db/*.sql arrancaba SIN RLS, es decir, inseguro por
-- defecto, y nada impedía que se desactivara sin dejar rastro en git.
--
-- Todo lo de aquí es IDEMPOTENTE y refleja lo que ya está aplicado en
-- producción. Correrlo sobre la instancia actual no cambia nada; su valor es
-- que un entorno nuevo quede igual de cerrado.
--
-- MODELO: el panel Next.js entra con `service_role`, que BYPASSA RLS por
-- definición. Por eso "RLS activo + cero políticas" es la configuración
-- correcta aquí: la app funciona con normalidad y `anon`/`authenticated` no
-- pueden leer ni escribir nada por PostgREST.
-- ============================================================================

-- ── Tablas del panel ────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS exchange_rates  ENABLE ROW LEVEL SECURITY;

-- ── Tablas compartidas con n8n y con el importador de inventario ────────────
-- No las crea este proyecto; se listan para que su RLS quede versionada.
--   saprod              → inventario en tiempo real; lo alimenta una API externa
--   n8n_chat_histories  → historial de conversaciones del agente de IA
--   asesores            → datos de asesores que usa n8n
--   technical_knowledge → libro de conocimiento del agente (EN DESUSO)
ALTER TABLE IF EXISTS saprod              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS n8n_chat_histories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS asesores            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS technical_knowledge ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- POLÍTICAS
-- ============================================================================
-- Estado verificado: UNA sola política en todo el esquema `public`.
--
--   technical_knowledge · "Allow anonymous reads on technical_knowledge"
--   SELECT · roles={public} · USING (true)
--
-- Es decir: lectura anónima de esa tabla. Su contenido no es sensible y ya no
-- alimenta al agente, así que el impacto hoy es bajo. Pero es una política
-- permisiva huérfana sobre una tabla huérfana: si algún día se reutiliza esa
-- tabla para alimentar al agente, la lectura anónima vuelve a ser relevante
-- sin que nadie se dé cuenta.
--
-- RECOMENDADO (no se aplica automáticamente — decisión del propietario):
--
--   DROP POLICY IF EXISTS "Allow anonymous reads on technical_knowledge"
--     ON technical_knowledge;
--
-- Ninguna otra tabla tiene políticas, y así debe seguir mientras el único
-- consumidor sea `service_role`.
-- ============================================================================

-- ============================================================================
-- PENDIENTE — mínimo privilegio para los consumidores que no son el panel
-- ============================================================================
-- `saprod` y `n8n_chat_histories` tienen RLS activo y cero políticas, luego
-- n8n y el importador externo de inventario NECESARIAMENTE usan una
-- credencial que bypassa RLS (`service_role` o un rol privilegiado de
-- Postgres). No está verificado cuál.
--
-- Mientras eso siga así, RLS no protege frente a esos componentes: si el
-- webhook público de n8n se compromete, el atacante hereda acceso total.
--
-- Lo correcto son roles dedicados con grants acotados y sus propias
-- políticas, en vez de repartir la llave maestra. Esbozo, a validar antes de
-- aplicar:
--
--   CREATE ROLE inventory_importer NOLOGIN;
--   GRANT SELECT, INSERT, UPDATE ON saprod TO inventory_importer;
--   CREATE POLICY importer_writes ON saprod
--     FOR ALL TO inventory_importer USING (true) WITH CHECK (true);
--
-- (Y equivalente para n8n sobre n8n_chat_histories / asesores.)
-- ============================================================================
