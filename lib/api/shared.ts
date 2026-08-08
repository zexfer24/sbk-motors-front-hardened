// Indica de dónde vino una respuesta de /api/inventory, /api/contacts o
// /api/chatwoot/*: Supabase real, la sincronización con Chatwoot, o el
// store de demo en memoria (fallback cuando falta configurar algo). Cada
// ruta lo incluye en su respuesta GET, así el front siempre refleja el
// estado real del backend en vez de depender de una variable de entorno
// que haya que sincronizar a mano. Ver db/SUPABASE_CONNECTION.md.
export type DataSource = "supabase" | "demo" | "chatwoot"
