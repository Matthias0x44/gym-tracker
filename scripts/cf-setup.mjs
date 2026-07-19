#!/usr/bin/env node
/**
 * Creates the D1 database (if needed), writes database_id into wrangler.jsonc,
 * applies migrations remotely, and prints next steps for ACCESS_TOKEN.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'

const DB_NAME = 'gym-tracker'
const WRANGLER = ['npx', 'wrangler']

function run(args, { inherit = true } = {}) {
  const res = spawnSync(WRANGLER[0], [...WRANGLER.slice(1), ...args], {
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : 'pipe',
  })
  if (res.status !== 0) {
    const err = res.stderr || res.stdout || `exit ${res.status}`
    throw new Error(typeof err === 'string' ? err : 'wrangler failed')
  }
  return res
}

function runCapture(args) {
  const res = spawnSync(WRANGLER[0], [...WRANGLER.slice(1), ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const out = `${res.stdout || ''}${res.stderr || ''}`
  if (res.status !== 0) {
    throw new Error(out || `wrangler failed (${res.status})`)
  }
  return out
}

function updateWranglerId(databaseId) {
  const path = new URL('../wrangler.jsonc', import.meta.url)
  let text = readFileSync(path, 'utf8')
  text = text.replace(
    /"database_id"\s*:\s*"[^"]*"/,
    `"database_id": "${databaseId}"`,
  )
  writeFileSync(path, text)
  console.log(`Updated wrangler.jsonc database_id → ${databaseId}`)
}

function main() {
  console.log('Checking Cloudflare auth…')
  try {
    run(['whoami'])
  } catch {
    console.error('\nNot logged in. Run: npx wrangler login\n')
    process.exit(1)
  }

  let databaseId = null
  const listOut = runCapture(['d1', 'list', '--json'])
  try {
    const rows = JSON.parse(listOut)
    const existing = (Array.isArray(rows) ? rows : []).find((r) => r.name === DB_NAME)
    if (existing?.uuid) databaseId = existing.uuid
  } catch {
    // fall through to create
  }

  if (!databaseId) {
    console.log(`Creating D1 database "${DB_NAME}"…`)
    const created = runCapture(['d1', 'create', DB_NAME])
    const match = created.match(/database_id\s*=\s*"([^"]+)"/i) || created.match(/([0-9a-f-]{36})/i)
    if (!match) {
      console.error(created)
      throw new Error('Could not parse database id from wrangler d1 create output')
    }
    databaseId = match[1]
  } else {
    console.log(`Using existing D1 database "${DB_NAME}" (${databaseId})`)
  }

  updateWranglerId(databaseId)

  console.log('Applying D1 migrations (remote)…')
  run(['d1', 'migrations', 'apply', DB_NAME, '--remote'])

  const tokenHint = randomBytes(24).toString('base64url')
  const devVarsPath = new URL('../.dev.vars', import.meta.url)
  if (!existsSync(devVarsPath)) {
    writeFileSync(devVarsPath, `ACCESS_TOKEN=${tokenHint}\n`)
    console.log('Wrote .dev.vars with a generated ACCESS_TOKEN for local wrangler dev.')
  }

  console.log(`
Next:
  1) Set the production secret (use your own passphrase or the generated one):
       npx wrangler secret put ACCESS_TOKEN
  2) Build + deploy:
       npm run build && npx wrangler deploy
  3) In the app Backup tab, paste the Worker URL and the same ACCESS_TOKEN,
     then "Upload this device to cloud" from the phone/computer that has your data.
`)
}

main()
