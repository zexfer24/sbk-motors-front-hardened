# Tabla `asesores` (Supabase) — referencia, no crear

Esta tabla **ya existe** en el proyecto de Supabase de producción — la creó
infraestructura por fuera de este repo, para la lógica de auto-asignación de
chats nuevos en n8n. No hay un `.sql` de creación acá a propósito: este repo
no es dueño de esa tabla, solo la lee (para mostrar el estado Activo/Inactivo
en el Centro de Control, ver `app/api/dashboard/agents/route.ts`) y escribe
un único campo (`activo`, ver `app/api/dashboard/agents/active/route.ts`).

Columnas confirmadas (consulta directa a producción, 2026-08-13):

| columna             | tipo        | quién la escribe                                  |
|---------------------|-------------|----------------------------------------------------|
| `id`                | int         | infra / n8n                                         |
| `chatwoot_user_id`  | int         | infra / n8n — mismo id que `app_metadata.chatwoot_agent_id` de Supabase Auth |
| `nombre`            | text        | infra / n8n                                         |
| `activo`            | bool        | infra / n8n, **y ahora también el front** (toggle del Centro de Control) |
| `ultima_asignacion` | timestamptz | n8n exclusivamente — el front nunca la toca         |

`activo = true` significa que el asesor está trabajando y n8n puede
asignarle chats nuevos; `false` significa que está libre/fuera de turno y
n8n lo salta. El toggle del front solo hace `UPDATE asesores SET activo = ...
WHERE chatwoot_user_id = ...` — nunca toca `ultima_asignacion` ni ninguna
otra columna, para no interferir con el round-robin de n8n.
