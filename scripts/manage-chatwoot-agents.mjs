#!/usr/bin/env node
// ============================================================================
// Crea agentes de Chatwoot (asesores) confirmados de una vez, sin depender
// de que llegue un correo de confirmación — usa la Platform API de
// Chatwoot (CHATWOOT_PLATFORM_TOKEN, generado desde /super_admin ->
// Platform Apps), distinta del token de agente normal (CHATWOOT_API_TOKEN).
//
// Uso:
//   node scripts/manage-chatwoot-agents.mjs create "Asesor 1" asesor1@sbk.motorcycles
//   node scripts/manage-chatwoot-agents.mjs list
//
// Lee CHATWOOT_URL, CHATWOOT_ACCOUNT_ID y CHATWOOT_PLATFORM_TOKEN de
// .env.local — nunca corre en el navegador.
// ============================================================================

import { readFileSync, existsSync } from "node:fs"
import { randomBytes } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"

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

const baseUrl = (process.env.CHATWOOT_URL ?? "").replace(/\/$/, "")
const accountId = process.env.CHATWOOT_ACCOUNT_ID
const platformToken = process.env.CHATWOOT_PLATFORM_TOKEN
const agentToken = process.env.CHATWOOT_API_TOKEN

if (!baseUrl || !accountId || !platformToken) {
  console.error("Falta CHATWOOT_URL, CHATWOOT_ACCOUNT_ID o CHATWOOT_PLATFORM_TOKEN en .env.local")
  process.exit(1)
}

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%*"

function generatePassword(length = 16) {
  const bytes = randomBytes(length)
  let out = ""
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

async function platformFetch(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      api_access_token: platformToken,
      ...options.headers,
    },
  })
  const text = await res.text()
  const body = text ? JSON.parse(text) : null
  if (!res.ok) {
    throw new Error(`${res.status} ${JSON.stringify(body)}`)
  }
  return body
}

async function createAgent(name, email) {
  const password = generatePassword()

  const user = await platformFetch("/platform/api/v1/users", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  })

  await platformFetch(`/platform/api/v1/accounts/${accountId}/account_users`, {
    method: "POST",
    body: JSON.stringify({ user_id: user.id, role: "agent" }),
  })

  return { name, email, password, userId: user.id, confirmed: user.confirmed }
}

async function main() {
  const [, , cmd, ...rest] = process.argv

  if (cmd === "create") {
    const [name, email] = rest
    if (!name || !email) {
      console.error('Uso: node scripts/manage-chatwoot-agents.mjs create "Asesor 1" asesor1@sbk.motorcycles')
      process.exit(1)
    }
    try {
      const result = await createAgent(name, email)
      console.log(`✓ ${result.name} <${result.email}>  ->  ${result.password}  (confirmed: ${result.confirmed})`)
    } catch (err) {
      console.error(`✗ ${email}: ${err.message}`)
      process.exit(1)
    }
    return
  }

  if (cmd === "list") {
    if (!agentToken) {
      console.error("Falta CHATWOOT_API_TOKEN en .env.local (token de agente normal, para listar)")
      process.exit(1)
    }
    const res = await fetch(`${baseUrl}/api/v1/accounts/${accountId}/agents`, {
      headers: { api_access_token: agentToken },
    })
    const agents = await res.json()
    for (const a of agents) {
      console.log(`${a.name} <${a.email}>  —  rol: ${a.role}  —  confirmado: ${a.confirmed}`)
    }
    return
  }

  console.log("Uso:")
  console.log('  node scripts/manage-chatwoot-agents.mjs create "Asesor 1" asesor1@sbk.motorcycles')
}

main()
