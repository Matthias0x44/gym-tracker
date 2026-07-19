import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  todayISO,
  type BodyWeight,
  type Exercise,
  type Regimen,
  type RegimenDay,
  type Scheme,
} from '../db'

/** Current on-disk schema. Bump only when the backup shape changes. */
export const BACKUP_SCHEMA_VERSION = 2

interface BackupData {
  app: 'gym-tracker'
  schemaVersion: number
  exportedAt: string
  exercises: Exercise[]
  schemes: Scheme[]
  regimens: Regimen[]
  regimenDays: RegimenDay[]
  bodyweights: BodyWeight[]
}

function isBackupData(value: unknown): value is BackupData {
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

export default function BackupView() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const counts = useLiveQuery(async () => ({
    exercises: await db.exercises.count(),
    schemes: await db.schemes.count(),
    regimens: await db.regimens.count(),
    days: await db.regimenDays.count(),
    bodyweights: await db.bodyweights.count(),
  }))

  async function buildBackup(): Promise<BackupData> {
    const [exercises, schemes, regimens, regimenDays, bodyweights] = await Promise.all([
      db.exercises.toArray(),
      db.schemes.toArray(),
      db.regimens.toArray(),
      db.regimenDays.toArray(),
      db.bodyweights.toArray(),
    ])
    return {
      app: 'gym-tracker',
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      exercises,
      schemes,
      regimens,
      regimenDays,
      bodyweights,
    }
  }

  async function exportData() {
    setBusy(true)
    setStatus('')
    try {
      const data = await buildBackup()
      const filename = `gym-tracker-backup-${todayISO()}.json`
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const file = new File([blob], filename, { type: 'application/json' })

      // Prefer the share sheet on phones so the file can go to Files / AirDrop / email.
      const canShareFile =
        typeof navigator !== 'undefined' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] })

      if (canShareFile) {
        await navigator.share({
          files: [file],
          title: 'Gym Tracker backup',
          text: 'Gym Tracker backup — import this on your other device.',
        })
        setStatus(
          `Shared backup with ${data.exercises.length} exercises and ${data.regimens.length} regimens.`,
        )
        return
      }

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      setStatus(
        `Exported ${data.exercises.length} exercises, ${data.regimens.length} regimens, ${data.bodyweights.length} weigh-ins.`,
      )
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setStatus('Share cancelled.')
        return
      }
      setStatus('Could not export backup.')
    } finally {
      setBusy(false)
    }
  }

  async function importData(file: File) {
    setBusy(true)
    setStatus('')
    try {
      let parsed: unknown
      try {
        parsed = JSON.parse(await file.text())
      } catch {
        setStatus('That file is not valid JSON.')
        return
      }

      if (!isBackupData(parsed)) {
        setStatus('That does not look like a Gym Tracker backup from this app.')
        return
      }
      if (parsed.schemaVersion !== BACKUP_SCHEMA_VERSION) {
        setStatus(
          `This backup is schema v${parsed.schemaVersion}; this app expects v${BACKUP_SCHEMA_VERSION}.`,
        )
        return
      }

      if (
        !confirm(
          'Replace ALL data on this device with this backup? Existing Log, Regimen, and Weight data here will be overwritten.',
        )
      ) {
        return
      }

      await db.transaction(
        'rw',
        [db.exercises, db.schemes, db.regimens, db.regimenDays, db.bodyweights],
        async () => {
          await Promise.all([
            db.exercises.clear(),
            db.schemes.clear(),
            db.regimens.clear(),
            db.regimenDays.clear(),
            db.bodyweights.clear(),
          ])
          // Keep original ids so regimen day schemeId references stay valid.
          if (parsed.exercises.length) await db.exercises.bulkAdd(parsed.exercises)
          if (parsed.schemes.length) await db.schemes.bulkAdd(parsed.schemes)
          if (parsed.regimens.length) await db.regimens.bulkAdd(parsed.regimens)
          if (parsed.regimenDays.length) await db.regimenDays.bulkAdd(parsed.regimenDays)
          if (parsed.bodyweights.length) await db.bodyweights.bulkAdd(parsed.bodyweights)
        },
      )

      setStatus(
        `Imported ${parsed.exercises.length} exercises, ${parsed.regimens.length} regimens, ${parsed.bodyweights.length} weigh-ins.`,
      )
    } catch {
      setStatus('Import failed. The file may be damaged.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="view">
      <header className="view-head">
        <h1>Backup</h1>
        <p className="muted">Move your data between devices. Updates never erase this store.</p>
      </header>

      {counts && (
        <div className="card">
          <div className="card-title">On this device</div>
          <div className="card-sub muted">
            {counts.exercises} exercises · {counts.schemes} schemes · {counts.regimens} regimens ·{' '}
            {counts.days} days · {counts.bodyweights} weigh-ins
          </div>
        </div>
      )}

      <div className="card backup-note">
        <div className="card-title">Why phone and computer differ</div>
        <p className="muted backup-help">
          Your Log and Regimen live in this browser only — they are not in GitHub Pages. Opening the
          site on your phone starts a separate empty copy. Export here, send the file to your phone,
          then import it there.
        </p>
      </div>

      <button className="btn primary block" type="button" disabled={busy} onClick={() => void exportData()}>
        Export backup
      </button>
      <button
        className="btn block"
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        Import backup (replaces this device)
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void importData(f)
          e.target.value = ''
        }}
      />

      {status && <p className="backup-status">{status}</p>}

      <p className="muted backup-help">
        Hosting stays on GitHub Pages. App updates only refresh the code — your IndexedDB data stays
        on each device unless you import a backup over it. Always export before switching phones.
      </p>
    </div>
  )
}
