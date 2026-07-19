import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  backupFilename,
  buildBackup,
  isBackupData,
  replaceLocalFromBackup,
  BACKUP_SCHEMA_VERSION,
} from '../backupData'
import { db } from '../db'
import {
  cloudConfigured,
  fetchCloudStatus,
  getAccessToken,
  getApiBase,
  pullFromCloud,
  pushToCloud,
  setAccessToken,
  setApiBase,
  type CloudStatus,
} from '../sync'

export default function BackupView() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [token, setToken] = useState(() => getAccessToken())
  const [apiBase, setApiBaseDraft] = useState(() => getApiBase())
  const [cloud, setCloud] = useState<CloudStatus>(() =>
    getAccessToken() ? { state: 'ok', updatedAt: null, empty: false } : { state: 'unconfigured' },
  )

  const counts = useLiveQuery(async () => ({
    exercises: await db.exercises.count(),
    schemes: await db.schemes.count(),
    regimens: await db.regimens.count(),
    days: await db.regimenDays.count(),
    bodyweights: await db.bodyweights.count(),
  }))

  async function refreshCloud() {
    setCloud(await fetchCloudStatus())
  }

  function saveCloudSettings() {
    setAccessToken(token)
    setApiBase(apiBase)
    setStatus('Cloud settings saved. Pulling…')
    void (async () => {
      setBusy(true)
      try {
        if (!cloudConfigured() && !token.trim()) {
          setStatus('Cleared access token. This device will stay local-only.')
          setCloud({ state: 'unconfigured' })
          return
        }
        setAccessToken(token)
        const result = await pullFromCloud()
        await refreshCloud()
        setStatus(
          result.empty
            ? 'Connected. Cloud is empty — use “Upload this device” to seed it.'
            : 'Connected and pulled the latest cloud snapshot onto this device.',
        )
      } catch (err) {
        setStatus(err instanceof Error ? err.message : 'Could not connect.')
        await refreshCloud()
      } finally {
        setBusy(false)
      }
    })()
  }

  async function uploadDevice() {
    setBusy(true)
    setStatus('')
    try {
      const { updatedAt } = await pushToCloud()
      await refreshCloud()
      setStatus(`Uploaded this device to Cloudflare D1 (${new Date(updatedAt).toLocaleString()}).`)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  async function downloadCloud() {
    setBusy(true)
    setStatus('')
    try {
      const result = await pullFromCloud()
      await refreshCloud()
      setStatus(
        result.empty
          ? 'Cloud is empty — nothing to download.'
          : `Downloaded cloud snapshot (${result.updatedAt ? new Date(result.updatedAt).toLocaleString() : 'ok'}).`,
      )
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Download failed.')
    } finally {
      setBusy(false)
    }
  }

  async function exportData() {
    setBusy(true)
    setStatus('')
    try {
      const data = await buildBackup()
      const filename = backupFilename()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const file = new File([blob], filename, { type: 'application/json' })

      const canShareFile =
        typeof navigator !== 'undefined' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] })

      if (canShareFile) {
        await navigator.share({
          files: [file],
          title: 'Gym Tracker backup',
          text: 'Gym Tracker backup file.',
        })
        setStatus(`Shared backup with ${data.exercises.length} exercises.`)
        return
      }

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      setStatus(`Exported ${data.exercises.length} exercises, ${data.regimens.length} regimens.`)
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

      if (!isBackupData(parsed) || parsed.schemaVersion !== BACKUP_SCHEMA_VERSION) {
        setStatus('That does not look like a compatible Gym Tracker backup.')
        return
      }

      if (
        !confirm(
          'Replace ALL data on this device with this backup? If cloud sync is on, it will also upload afterward.',
        )
      ) {
        return
      }

      await replaceLocalFromBackup(parsed)
      setStatus(
        `Imported ${parsed.exercises.length} exercises, ${parsed.regimens.length} regimens.`,
      )
    } catch {
      setStatus('Import failed. The file may be damaged.')
    } finally {
      setBusy(false)
    }
  }

  const cloudLabel =
    cloud.state === 'unconfigured'
      ? 'Not connected'
      : cloud.state === 'error'
        ? cloud.message
        : cloud.empty
          ? 'Connected — cloud empty'
          : `Connected — updated ${cloud.updatedAt ? new Date(cloud.updatedAt).toLocaleString() : 'recently'}`

  return (
    <div className="view">
      <header className="view-head">
        <h1>Backup</h1>
        <p className="muted">Cloudflare D1 sync across devices, plus optional file backup.</p>
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
        <div className="card-title">Cloudflare sync</div>
        <p className="muted backup-help">
          Your Log and Regimen sync to a Cloudflare D1 database. Set the Worker API URL and access
          token once on each device. After that, edits upload automatically.
        </p>
        <p className="backup-status cloud-status">{cloudLabel}</p>

        <label className="field grow" style={{ marginTop: 12 }}>
          <span>API URL</span>
          <input
            value={apiBase}
            onChange={(e) => setApiBaseDraft(e.target.value)}
            placeholder="https://gym-tracker.YOUR_SUBDOMAIN.workers.dev"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <p className="muted backup-help" style={{ marginTop: 6 }}>
          Leave blank if the app is hosted on the same Worker (same origin).
        </p>

        <label className="field grow" style={{ marginTop: 12 }}>
          <span>Access token</span>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Same secret as Worker ACCESS_TOKEN"
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <button
          className="btn primary block"
          type="button"
          disabled={busy}
          onClick={saveCloudSettings}
        >
          Save & connect
        </button>
        <button
          className="btn block"
          type="button"
          disabled={busy || !token.trim()}
          onClick={() => void refreshCloud().then(() => setStatus('Cloud status refreshed.'))}
        >
          Refresh cloud status
        </button>
        <button className="btn block" type="button" disabled={busy || !token.trim()} onClick={() => void uploadDevice()}>
          Upload this device to cloud
        </button>
        <button className="btn block" type="button" disabled={busy || !token.trim()} onClick={() => void downloadCloud()}>
          Download cloud to this device
        </button>
      </div>

      <div className="card backup-note">
        <div className="card-title">File backup</div>
        <p className="muted backup-help">
          Optional offline copy. Prefer cloud sync for phone ↔ computer.
        </p>
        <button className="btn block" type="button" disabled={busy} onClick={() => void exportData()}>
          Export JSON file
        </button>
        <button
          className="btn block"
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          Import JSON file
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
      </div>

      {status && <p className="backup-status">{status}</p>}
    </div>
  )
}
