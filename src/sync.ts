import { db } from './db'
import {
  BACKUP_SCHEMA_VERSION,
  buildBackup,
  isBackupData,
  replaceLocalFromBackup,
  type BackupData,
} from './backupData'

const TOKEN_KEY = 'gym-tracker-access-token'
const API_BASE_KEY = 'gym-tracker-api-base'

/** Default Worker URL used when the SPA still runs on GitHub Pages. */
export const DEFAULT_CLOUD_API = 'https://gym-tracker.rectangular-hardhat.workers.dev'

const SEED_NAMES = ['Squat', 'Bench Press', 'Deadlift', 'Overhead Press', 'Pull-up', 'Row']

let pushTimer: ReturnType<typeof setTimeout> | null = null
let applyingRemote = false
let middlewareInstalled = false

export type CloudStatus =
  | { state: 'unconfigured' }
  | { state: 'ok'; updatedAt: number | null; empty: boolean; exerciseCount: number; regimenCount: number }
  | { state: 'error'; message: string }

export type LocalStats = {
  exercises: number
  schemes: number
  regimens: number
  days: number
  bodyweights: number
}

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
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  // On GitHub Pages the API is on the Worker origin.
  if (typeof location !== 'undefined' && location.hostname.endsWith('github.io')) {
    return DEFAULT_CLOUD_API
  }
  return ''
}

export function setApiBase(base: string): void {
  const b = base.trim().replace(/\/$/, '')
  if (b) localStorage.setItem(API_BASE_KEY, b)
  else localStorage.removeItem(API_BASE_KEY)
}

export function cloudConfigured(): boolean {
  return getAccessToken().length > 0
}

export async function getLocalStats(): Promise<LocalStats> {
  const [exercises, schemes, regimens, days, bodyweights] = await Promise.all([
    db.exercises.count(),
    db.schemes.count(),
    db.regimens.count(),
    db.regimenDays.count(),
    db.bodyweights.count(),
  ])
  return { exercises, schemes, regimens, days, bodyweights }
}

export function isSeedLike(data: BackupData): boolean {
  if (data.regimens.length > 0 || data.regimenDays.length > 0) return false
  if (data.exercises.length === 0 || data.exercises.length > SEED_NAMES.length) return false
  const names = new Set(data.exercises.map((e) => e.name))
  return [...names].every((n) => SEED_NAMES.includes(n))
}

export function localRicherThan(data: BackupData, local: LocalStats): boolean {
  if (local.regimens > data.regimens.length) return true
  if (local.days > data.regimenDays.length) return true
  if (local.exercises > data.exercises.length) return true
  if (isSeedLike(data) && (local.exercises > 0 || local.regimens > 0) && !isLocalSeedOnly(local)) {
    return true
  }
  return false
}

function isLocalSeedOnly(local: LocalStats): boolean {
  return local.regimens === 0 && local.days === 0 && local.exercises > 0 && local.exercises <= SEED_NAMES.length
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

async function readCloudSnapshot(): Promise<{
  empty: boolean
  updatedAt: number | null
  data: BackupData | null
}> {
  const res = await apiFetch('/api/snapshot')
  if (res.status === 401) throw new Error('Access token rejected.')
  if (!res.ok) throw new Error(`Cloud error (${res.status}).`)
  const body = (await res.json()) as {
    empty: boolean
    updatedAt: number | null
    data: BackupData | null
  }
  if (body.empty || !body.data) return { empty: true, updatedAt: null, data: null }
  if (!isBackupData(body.data) || body.data.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new Error('Cloud snapshot is not a compatible gym-tracker backup.')
  }
  return { empty: false, updatedAt: body.updatedAt, data: body.data }
}

export async function fetchCloudStatus(): Promise<CloudStatus> {
  if (!cloudConfigured()) return { state: 'unconfigured' }
  try {
    const snap = await readCloudSnapshot()
    if (snap.empty || !snap.data) {
      return { state: 'ok', updatedAt: null, empty: true, exerciseCount: 0, regimenCount: 0 }
    }
    return {
      state: 'ok',
      updatedAt: snap.updatedAt,
      empty: false,
      exerciseCount: snap.data.exercises.length,
      regimenCount: snap.data.regimens.length,
    }
  } catch (err) {
    return {
      state: 'error',
      message: err instanceof Error ? err.message : 'Could not reach the cloud API. Check the API URL.',
    }
  }
}

export async function pullFromCloud(opts?: {
  force?: boolean
}): Promise<{ empty: boolean; updatedAt: number | null; skipped?: boolean; reason?: string }> {
  const snap = await readCloudSnapshot()
  if (snap.empty || !snap.data) return { empty: true, updatedAt: null }

  const local = await getLocalStats()
  if (!opts?.force && localRicherThan(snap.data, local)) {
    return {
      empty: false,
      updatedAt: snap.updatedAt,
      skipped: true,
      reason:
        'This browser has more data than the cloud (cloud still looks like demo seeds). Use “Upload this device” instead of download.',
    }
  }

  applyingRemote = true
  try {
    await replaceLocalFromBackup(snap.data)
  } finally {
    applyingRemote = false
  }
  return { empty: false, updatedAt: snap.updatedAt }
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
 * Boot cloud sync. Never clobber a richer local DB with demo/seed cloud data.
 */
export async function initCloudSync(): Promise<
  'pulled' | 'empty-cloud' | 'skipped' | 'kept-local' | 'error'
> {
  installCloudSyncMiddleware()
  if (!cloudConfigured()) return 'skipped'
  try {
    const result = await pullFromCloud()
    if (result.empty) return 'empty-cloud'
    if (result.skipped) {
      // Local wins — push it up so cloud stops serving seeds.
      scheduleCloudPush(200)
      return 'kept-local'
    }
    return 'pulled'
  } catch (err) {
    console.warn('[gym-tracker] cloud pull failed', err)
    return 'error'
  }
}
