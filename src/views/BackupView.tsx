import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, todayISO, type Exercise, type SetEntry, type BodyWeight, type Routine } from '../db'

interface BackupData {
  app: 'gym-tracker'
  version: number
  exportedAt: string
  exercises: Exercise[]
  sets: SetEntry[]
  bodyweights: BodyWeight[]
  routines: Routine[]
}

export default function BackupView() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState('')
  const counts = useLiveQuery(async () => ({
    exercises: await db.exercises.count(),
    sets: await db.sets.count(),
    bodyweights: await db.bodyweights.count(),
    routines: await db.routines.count(),
  }))

  async function exportData() {
    const [exercises, sets, bodyweights, routines] = await Promise.all([
      db.exercises.toArray(),
      db.sets.toArray(),
      db.bodyweights.toArray(),
      db.routines.toArray(),
    ])
    const data: BackupData = {
      app: 'gym-tracker',
      version: 1,
      exportedAt: new Date().toISOString(),
      exercises,
      sets,
      bodyweights,
      routines,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gym-tracker-backup-${todayISO()}.json`
    a.click()
    URL.revokeObjectURL(url)
    setStatus(`Exported ${sets.length} sets and ${exercises.length} exercises.`)
  }

  async function importData(file: File) {
    let data: BackupData
    try {
      data = JSON.parse(await file.text())
    } catch {
      setStatus('That file is not valid JSON.')
      return
    }
    if (data.app !== 'gym-tracker' || !Array.isArray(data.sets)) {
      setStatus('That does not look like a Gym Tracker backup.')
      return
    }
    if (!confirm('Replace ALL data on this device with this backup? This cannot be undone.')) return
    await db.transaction('rw', db.exercises, db.sets, db.bodyweights, db.routines, async () => {
      await Promise.all([
        db.exercises.clear(),
        db.sets.clear(),
        db.bodyweights.clear(),
        db.routines.clear(),
      ])
      await db.exercises.bulkAdd(data.exercises ?? [])
      await db.sets.bulkAdd(data.sets ?? [])
      await db.bodyweights.bulkAdd(data.bodyweights ?? [])
      await db.routines.bulkAdd(data.routines ?? [])
    })
    setStatus(`Imported ${data.sets.length} sets and ${data.exercises.length} exercises.`)
  }

  return (
    <div className="view">
      <header className="view-head">
        <h1>Backup</h1>
        <p className="muted">Move your data between this device and your phone.</p>
      </header>

      {counts && (
        <div className="card">
          <div className="card-title">On this device</div>
          <div className="card-sub muted">
            {counts.exercises} exercises · {counts.sets} sets · {counts.bodyweights} weigh-ins ·{' '}
            {counts.routines} routines
          </div>
        </div>
      )}

      <button className="btn primary block" onClick={exportData}>
        Export backup
      </button>
      <button className="btn block" onClick={() => fileRef.current?.click()}>
        Import backup (replaces current data)
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) importData(f)
          e.target.value = ''
        }}
      />

      {status && <p className="backup-status">{status}</p>}

      <p className="muted backup-help">
        To sync: export on one device, send the file to the other (AirDrop, email, Files), then
        import it there. The newest export wins — it overwrites whatever is on that device.
      </p>
    </div>
  )
}
