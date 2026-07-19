import { db } from './db'
import { BACKUP_SCHEMA_VERSION, buildBackup, isBackupData, replaceLocalFromBackup, type BackupData } from './backupData'

const TOKEN_KEY = 'gym-tracker-access-token'
const API_BASE_KEY = 'gym-tracker-api-base'

let pushTimer: ReturnType<typeof setTimeout> | null = null
let applyingRemote = false
let middlewareInstalled = false

export type CloudStatus =
  | { state: 'unconfigured' }
  | { state: 'ok'; updatedAt: number | null; empty: boolean }
  | { state: 'error'; message: string }

export function getAccessToken(): string {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setAccessToken(token: string): void {
  const t = token.trim()
  if (t) localStorage.setItem(TOKEN_KEY, t)
  else localStorage.removeItem(TOKEN_KEY)
}

/** Empty / relative means same origin (Worker hosting the SPA). */
export function getApiBase(): string {
  const stored = localStorage.getItem(API_BASE_KEY)
  if (stored != null) return stored.replace(/\/$/, '')
  const fromEnv = (import.meta.env.VITE_API_BASE as string | undefined) || ''
  return fromEnv.replace(/\/$/, '')
}

export function setApiBase(base: string): void {
  const b = base.trim().replace(/\/$/, '')
  if (b) localStorage.setItem(API_BASE_KEY, b)
  else localStorage.removeItem(API_BASE_KEY)
}

export function cloudConfigured(): boolean {
  return getAccessToken().length > 0
}

function apiUrl(path: string): string {
  const base = getApiBase()
  return `${base}${path}`
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getAccessToken()
  if (!token) throw new Error('Set an access token in Backup first.')
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(apiUrl(path), { ...init, headers })
}

export async function fetchCloudStatus(): Promise<CloudStatus> {
  if (!cloudConfigured()) return { state: 'unconfigured' }
  try {
    const res = await apiFetch('/api/snapshot')
    if (res.status === 401) return { state: 'error', message: 'Access token rejected.' }
    if (!res.ok) return { state: 'error', message: `Cloud error (${res.status}).` }
    const body = (await res.json()) as { empty?: boolean; updatedAt?: number | null }
    return { state: 'ok', updatedAt: body.updatedAt ?? null, empty: Boolean(body.empty) }
  } catch {
    return { state: 'error', message: 'Could not reach the cloud API. Check the API URL.' }
  }
}

export async function pullFromCloud(): Promise<{ empty: boolean; updatedAt: number | null }> {
  const res = await apiFetch('/api/snapshot')
  if (res.status === 401) throw new Error('Access token rejected.')
  if (!res.ok) throw new Error(`Pull failed (${res.status}).`)
  const body = (await res.json()) as {
    empty: boolean
    updatedAt: number | null
    data: BackupData | null
  }
  if (body.empty || !body.data) return { empty: true, updatedAt: null }
  if (!isBackupData(body.data) || body.data.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new Error('Cloud snapshot is not a compatible gym-tracker backup.')
  }
  applyingRemote = true
  try {
    await replaceLocalFromBackup(body.data)
  } finally {
    applyingRemote = false
  }
  return { empty: false, updatedAt: body.updatedAt }
}

export async function pushToCloud(): Promise<{ updatedAt: number }> {
  const data = await buildBackup()
  const res = await apiFetch('/api/snapshot', {
    method: 'PUT',
    body: JSON.stringify(data),
  })
  if (res.status === 401) throw new Error('Access token rejected.')
  if (!res.ok) {
    let detail = ''
    try {
      detail = ((await res.json()) as { error?: string }).error || ''
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Push failed (${res.status}).`)
  }
  const body = (await res.json()) as { updatedAt: number }
  return { updatedAt: body.updatedAt }
}

export function scheduleCloudPush(delayMs = 600): void {
  if (applyingRemote || !cloudConfigured()) return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    void pushToCloud().catch((err) => {
      console.warn('[gym-tracker] cloud push failed', err)
    })
  }, delayMs)
}

/** Dexie middleware: any local write schedules a cloud push. */
export function installCloudSyncMiddleware(): void {
  if (middlewareInstalled) return
  middlewareInstalled = true
  db.use({
    stack: 'dbcore',
    name: 'cloudSync',
    create(downlevelDatabase) {
      return {
        ...downlevelDatabase,
        table(tableName) {
          const table = downlevelDatabase.table(tableName)
          return {
            ...table,
            mutate(req) {
              return table.mutate(req).then((res) => {
                if (!applyingRemote) scheduleCloudPush()
                return res
              })
            },
          }
        },
      }
    },
  })
}

/**
 * Boot cloud sync: pull remote snapshot when configured.
 * Returns whether local data was replaced from the cloud.
 */
export async function initCloudSync(): Promise<'pulled' | 'empty-cloud' | 'skipped' | 'error'> {
  installCloudSyncMiddleware()
  if (!cloudConfigured()) return 'skipped'
  try {
    const result = await pullFromCloud()
    return result.empty ? 'empty-cloud' : 'pulled'
  } catch (err) {
    console.warn('[gym-tracker] cloud pull failed', err)
    return 'error'
  }
}
