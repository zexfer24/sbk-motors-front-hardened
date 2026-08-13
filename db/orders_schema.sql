-- ============================================================================
-- SBK Motors · Esquema de ventas (PostgreSQL · mismo proyecto de Supabase
-- que ya usa Inventario — ver lib/supabase/client.ts, comparten credenciales).
-- ============================================================================
-- Corre esto completo en el SQL Editor de tu proyecto de Supabase SOLO si
-- todavía no tienes la tabla `orders` creada. La tabla queda vacía a
-- propósito — sin datos mock.
--
-- Las ventas solo se crean desde el flujo de "Cerrar venta" en el chat de
-- WhatsApp — no hay edición ni borrado desde la UI.
-- ============================================================================

CREATE TABLE orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id       TEXT NOT NULL,
  advisor_name          TEXT NOT NULL DEFAULT '',
  customer_name         TEXT NOT NULL,
  customer_phone        TEXT NOT NULL,
  state                 TEXT NOT NULL,
  city                  TEXT NOT NULL,
  address               TEXT NOT NULL,
  payment_method        TEXT NOT NULL,
  payment_method_other  TEXT,
  shipping_info         TEXT NOT NULL DEFAULT '',
  capture_url           TEXT,
  items                 JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE INDEX idx_orders_created_at ON orders (created_at DESC);

-- ============================================================================
-- MIGRACIÓN — si ya corriste la versión anterior de este archivo (tabla
-- `orders` sin `advisor_name` ni `items`), corre esto en su lugar en vez
-- del CREATE TABLE de arriba:
-- ============================================================================
--
-- ALTER TABLE orders ADD COLUMN IF NOT EXISTS advisor_name TEXT NOT NULL DEFAULT '';
-- ALTER TABLE orders ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ============================================================================
-- MIGRACIÓN — estado de la venta (Confirmar/Devolución en Ventas) y totales
-- calculados en el servidor al cerrar la venta (items están en Bolívares;
-- total_usd queda congelado con la tasa BCV del día de la venta, así
-- reportes de días pasados no cambian si la tasa de hoy es distinta). Ver
-- lib/bcv-rate.ts y app/api/orders/route.ts.
-- ============================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pendiente';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_bs NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(10, 4);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_usd NUMERIC(12, 2) NOT NULL DEFAULT 0;

-- ============================================================================
-- MIGRACIÓN — datos propios de Cashea. El cliente solo paga una inicial
-- (fracción del precio real del producto) al cerrar la venta — total_usd
-- de la orden queda igual a cashea_initial_usd (lo que de verdad se
-- recaudó hoy), no al precio completo del producto. Ver
-- app/api/orders/route.ts y components/chat/close-sale-modal.tsx.
-- ============================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS cashea_order_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cashea_total_usd NUMERIC(10, 2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cashea_initial_usd NUMERIC(10, 2);

-- ============================================================================
-- MIGRACIÓN — cédula de identidad del cliente (solo dígitos, sin "V-" ni
-- puntos — eso se agrega al mostrarla si hace falta). Opcional: no todas
-- las ventas viejas la tienen. Ver components/chat/close-sale-modal.tsx.
-- ============================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_cedula TEXT;

-- ============================================================================
-- MIGRACIÓN — acceso de asesores a Ventas (antes admin-only), número de guía
-- opcional, y flujo de solicitud de devolución/confirmación (el asesor
-- solicita, el admin ejecuta — ver app/api/orders/route.ts,
-- app/api/orders/[id]/request/route.ts y db/order_events_schema.sql).
-- ============================================================================
-- advisor_email: quién cerró la venta, identificado por su sesión (no por el
-- nombre visible en Chatwoot, que puede repetirse o cambiar) — así el asesor
-- puede filtrar "mis ventas" de forma confiable. Ventas creadas antes de esta
-- columna quedan con NULL: solo el admin las ve hasta que se identifiquen.
--
-- deleted_at: borrado lógico, no físico — eliminar una venta nunca debe
-- romper la referencia de order_events (el log de auditoría tiene que
-- sobrevivir aunque la venta se borre de la vista).
-- ============================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS advisor_email TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pending_request TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pending_request_by TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pending_request_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_advisor_email ON orders (advisor_email);
