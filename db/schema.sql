-- ============================================================================
-- OBSOLETO — no corras este archivo. El inventario real vive en `saprod`,
-- la tabla que ya usa el agente de IA de n8n para responder por
-- WhatsApp — no una tabla propia de este proyecto. Ver
-- db/SUPABASE_CONNECTION.md. Se deja este archivo solo como referencia
-- histórica de una versión anterior que sí tenía su propia tabla
-- `inventory_items`.
-- ============================================================================

-- ============================================================================
-- SBK Motors · Esquema de inventario (PostgreSQL · proyecto Supabase
-- dedicado a Inventario — separado del proyecto de CRM).
-- ============================================================================
-- Corre esto completo en el SQL Editor de tu proyecto de Supabase de
-- Inventario. La tabla queda vacía a propósito — sin datos mock. Los
-- artículos se agregan a mano desde el panel "Agregar artículo" de la app.
--
-- Solo lectura y alta desde el front — no hay edición ni borrado desde
-- la UI. "reference" es un campo de texto libre (código del fabricante
-- o proveedor, distinto del "sku" interno).
-- ============================================================================

CREATE TABLE inventory_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  reference   TEXT NOT NULL DEFAULT '',
  price       NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  specs       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE INDEX idx_inventory_items_name_trgm ON inventory_items USING gin (name gin_trgm_ops);
CREATE INDEX idx_inventory_items_sku ON inventory_items (sku);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_inventory_items_updated_at
  BEFORE UPDATE ON inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- MIGRACIÓN — si ya tienes una tabla `inventory_items` corriendo en
-- producción con la columna `category` (versión anterior de este
-- esquema), corre esto en su lugar en vez del CREATE TABLE de arriba:
-- ============================================================================
--
-- ALTER TABLE inventory_items DROP COLUMN IF EXISTS category;
-- DROP TYPE IF EXISTS inventory_category;
-- ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS reference TEXT NOT NULL DEFAULT '';
-- DROP INDEX IF EXISTS idx_inventory_items_category;
--
-- Si además quieres vaciar los datos mock de prueba que trajo la versión
-- anterior de este esquema:
-- TRUNCATE inventory_items;
