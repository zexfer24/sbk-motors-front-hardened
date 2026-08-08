#!/usr/bin/env node
// ============================================================================
// Administra las cuentas del login interno de SBK Motors (Supabase Auth).
// No hay pantalla de registro a propósito — las cuentas solo se crean desde
// acá, a mano, por quien tenga acceso a las credenciales de Supabase.
//
// Uso:
//   node scripts/manage-users.mjs create <email> <asesor|admin>
//   node scripts/manage-users.mjs list
//   node scripts/manage-users.mjs reset-password <email>
//   node scripts/manage-users.mjs link-chatwoot <email> <chatwoot_agent_id>
//
// Lee SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY de .env.local — nunca corre
// en el navegador, solo desde tu máquina o un entorno de confianza.
// ============================================================================

import { readFileSync, existsSync } from "node:fs"
import { randomBytes } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createClient } from "@supabase/supabase-js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, "..", ".env.local")

function loadEnv() {
  if (!existsSync(envPath)) return
  const content = readFileSync(envPath, "utf8")
  for (const line of content.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    if (!(key in process.env)) process.env[key] = value
  }
}

loadEnv()

const url = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRoleKey) {
  console.error("Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local")
  process.exit(1)
}

const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } })

// Sin 0/O/1/l/I para que no haya ambigüedad al copiar la contraseña a mano.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%*"

function generatePassword(length = 16) {
  const bytes = randomBytes(length)
  let out = ""
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

async function createUser(email, role) {
  if (role !== "asesor" && role !== "admin") {
    console.error(`Rol inválido: "${role}" — usa "asesor" o "admin"`)
    process.exit(1)
  }

  const password = generatePassword()
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // no depende de que el correo reciba nada — puede no ser un buzón real
    app_metadata: { role },
  })

  if (error) {
    console.error(`✗ ${email}: ${error.message}`)
    return null
  }

  return { email: data.user.email, password, role }
}

async function resetPassword(email) {
  const { data: list, error: listError } = await supabase.auth.admin.listUsers()
  if (listError) {
    console.error(listError.message)
    process.exit(1)
  }
  const existing = list.users.find((u) => u.email === email)
  if (!existing) {
    console.error(`No existe ninguna cuenta con el correo ${email}`)
    process.exit(1)
  }

  const password = generatePassword()
  const { error } = await supabase.auth.admin.updateUserById(existing.id, { password })
  if (error) {
    console.error(error.message)
    process.exit(1)
  }
  return { email, password }
}

async function linkChatwoot(email, chatwootAgentId) {
  const agentId = Number(chatwootAgentId)
  if (!Number.isInteger(agentId) || agentId <= 0) {
    console.error(`chatwoot_agent_id inválido: "${chatwootAgentId}" — debe ser un entero positivo`)
    process.exit(1)
  }

  const { data: list, error: listError } = await supabase.auth.admin.listUsers()
  if (listError) {
    console.error(listError.message)
    process.exit(1)
  }
  const existing = list.users.find((u) => u.email === email)
  if (!existing) {
    console.error(`No existe ninguna cuenta con el correo ${email}`)
    process.exit(1)
  }

  // updateUserById no mezcla app_metadata solo — hay que mandar el objeto
  // completo (rol incluido) para no perder lo que ya tenía.
  const { error } = await supabase.auth.admin.updateUserById(existing.id, {
    app_metadata: { ...existing.app_metadata, chatwoot_agent_id: agentId },
  })
  if (error) {
    console.error(error.message)
    process.exit(1)
  }
  return { email, agentId }
}

async function main() {
  const [, , cmd, ...rest] = process.argv

  if (cmd === "create") {
    const [email, role] = rest
    if (!email || !role) {
      console.error("Uso: node scripts/manage-users.mjs create <email> <asesor|admin>")
      process.exit(1)
    }
    const result = await createUser(email, role)
    if (result) {
      console.log(`✓ ${result.email}  (${result.role})  ->  ${result.password}`)
    }
    return
  }

  if (cmd === "reset-password") {
    const [email] = rest
    if (!email) {
      console.error("Uso: node scripts/manage-users.mjs reset-password <email>")
      process.exit(1)
    }
    const result = await resetPassword(email)
    console.log(`✓ ${result.email}  ->  ${result.password}`)
    return
  }

  if (cmd === "link-chatwoot") {
    const [email, chatwootAgentId] = rest
    if (!email || !chatwootAgentId) {
      console.error("Uso: node scripts/manage-users.mjs link-chatwoot <email> <chatwoot_agent_id>")
      process.exit(1)
    }
    const result = await linkChatwoot(email, chatwootAgentId)
    console.log(`✓ ${result.email}  ->  chatwoot_agent_id ${result.agentId}`)
    return
  }

  if (cmd === "list") {
    const { data, error } = await supabase.auth.admin.listUsers()
    if (error) {
      console.error(error.message)
      process.exit(1)
    }
    for (const u of data.users) {
      const role = u.app_metadata?.role ?? "(sin rol, se trata como asesor)"
      const chatwoot = u.app_metadata?.chatwoot_agent_id
      console.log(`${u.email}  —  rol: ${role}${chatwoot ? `  —  chatwoot_agent_id: ${chatwoot}` : ""}`)
    }
    return
  }

  console.log("Uso:")
  console.log("  node scripts/manage-users.mjs create <email> <asesor|admin>")
  console.log("  node scripts/manage-users.mjs reset-password <email>")
  console.log("  node scripts/manage-users.mjs link-chatwoot <email> <chatwoot_agent_id>")
  console.log("  node scripts/manage-users.mjs list")
}

main()
