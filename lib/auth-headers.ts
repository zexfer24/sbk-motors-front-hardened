// Nombres de los headers que proxy.ts agrega a cada request ya
// autenticado, para que las rutas /api/* sepan quién llama sin tener que
// volver a leer la cookie de sesión ni pegarle a Supabase otra vez.
export const USER_ROLE_HEADER = "x-user-role"
export const USER_EMAIL_HEADER = "x-user-email"
export const CHATWOOT_AGENT_ID_HEADER = "x-chatwoot-agent-id"
export const CHATWOOT_API_TOKEN_HEADER = "x-chatwoot-api-token"
