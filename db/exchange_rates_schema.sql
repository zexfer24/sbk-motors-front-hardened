-- ============================================================================
-- SBK Motors · Tasa de cambio oficial (BCV) — mismo proyecto de Supabase
-- que ya usan Inventario y Ventas.
-- ============================================================================
-- Corre esto completo en el SQL Editor de tu proyecto de Supabase SOLO si
-- todavía no tienes la tabla `exchange_rates` creada.
--
-- Un registro por día — el BCV publica la tasa oficial una vez al día.
-- La app la lee/escribe sola desde lib/bcv-rate.ts (llama a una API pública
-- que espeja la tasa oficial la primera vez que se necesita ese día, y
-- la cachea aquí para no volver a pedirla).
-- ============================================================================

CREATE TABLE exchange_rates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_date   DATE NOT NULL UNIQUE,
  rate        NUMERIC(10, 4) NOT NULL,
  source      TEXT NOT NULL DEFAULT 'bcv',
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
