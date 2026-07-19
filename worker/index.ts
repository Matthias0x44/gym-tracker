export interface Env {
  DB: D1Database
  ACCESS_TOKEN: string
  ASSETS?: Fetcher
}

type SnapshotBody = {
  app: string
  schemaVersion: number
  exportedAt?: string
  exercises: unknown[]
  schemes: unknown[]
  regimens: unknown[]
  regimenDays: unknown[]
  bodyweights: unknown[]
}

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

function unauthorized(): Response {
  return json({ error: 'Unauthorized' }, 401)
}

function authed(request: Request, env: Env): boolean {
  const expected = env.ACCESS_TOKEN
  if (!expected) return false
  const header = request.headers.get('Authorization') || ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  return bearer.length > 0 && bearer === expected
}

function isSnapshot(value: unknown): value is SnapshotBody {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    v.app === 'gym-tracker' &&
    typeof v.schemaVersion === 'number' &&
    Array.isArray(v.exercises) &&
    Array.isArray(v.schemes) &&
    Array.isArray(v.regimens) &&
    Array.isArray(v.regimenDays) &&
    Array.isArray(v.bodyweights)
  )
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (url.pathname === '/api/health') {
    return json({ ok: true, service: 'gym-tracker' })
  }

  if (url.pathname === '/api/snapshot') {
    if (!authed(request, env)) return unauthorized()

    if (request.method === 'GET') {
      const row = await env.DB.prepare('SELECT payload, updated_at FROM snapshots WHERE id = 1').first<{
        payload: string
        updated_at: number
      }>()
      if (!row) {
        return json({ empty: true, updatedAt: null, data: null })
      }
      return json({
        empty: false,
        updatedAt: row.updated_at,
        data: JSON.parse(row.payload) as SnapshotBody,
      })
    }

    if (request.method === 'PUT') {
      let body: unknown
      try {
        body = await request.json()
      } catch {
        return json({ error: 'Invalid JSON' }, 400)
      }
      if (!isSnapshot(body)) {
        return json({ error: 'Invalid snapshot payload' }, 400)
      }
      if (body.schemaVersion !== 2) {
        return json({ error: `Unsupported schemaVersion ${body.schemaVersion}` }, 400)
      }

      const updatedAt = Date.now()
      const payload = JSON.stringify({
        ...body,
        exportedAt: body.exportedAt || new Date(updatedAt).toISOString(),
      })

      await env.DB.prepare(
        `INSERT INTO snapshots (id, payload, updated_at) VALUES (1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
      )
        .bind(payload, updatedAt)
        .run()

      return json({ ok: true, updatedAt })
    }
  }

  return json({ error: 'Not found' }, 404)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env)
    }
    if (env.ASSETS) {
      return env.ASSETS.fetch(request)
    }
    return json({ error: 'Not found' }, 404)
  },
}
