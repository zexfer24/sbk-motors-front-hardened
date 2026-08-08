// ============================================================================
// Tipos de dominio · Inventario
//
// La tabla real en Supabase es `saprod` — la misma que usa la IA para
// responder por WhatsApp, no una tabla propia de este front. Su esquema
// es fijo (codprod/descrip/precio3/existen) y no lo tocamos; por eso este
// tipo no tiene "reference" ni "specs" ni fechas — esos campos no existen
// en `saprod`. Ver db/SUPABASE_CONNECTION.md.
// ============================================================================

export type InventoryItemDb = {
  id: string
  sku: string
  name: string
  price: number
  stock: number
}
