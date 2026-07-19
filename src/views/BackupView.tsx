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
  DEFAULT_CLOUD_API,
  cloudConfigured,
  fetchCloudStatus,
  getAccessToken,
  getApiBase,
  getLocalStats,
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
  const [apiBase, setApiBaseDraft] = useState(() => getApiBase() || DEFAULT_CLOUD_API)
  const [cloud, setCloud] = useState<CloudStatus>({ state: 'unconfigured' })

  const counts = useLiveQuery(async () => ({
    exercises: await db.exercises.count(),
    schemes: await db.schemes.count(),
    regimens: await db.regimens.count(),
    days: await db.regimenDays.count(),
    bodyweights: await db.bodyweights.count(),
  }))

  const onGithubPages =
    typeof location !== 'undefined' && location.hostname.endsWith('github.io')
  const hasRealLocalData = Boolean(
    counts && (counts.regimens > 0 || counts.days > 0 || counts.exercises > 6),
  )

  async function refreshCloud() {
    setCloud(await fetchCloudStatus())
  }

  function saveCloudSettings() {
    setAccessToken(token)
    setApiBase(apiBase.trim() || DEFAULT_CLOUD_API)
    setStatus('Cloud settings saved…')
    void (async () => {
      setBusy(true)
      try {
        if (!token.trim()) {
          setAccessToken('')
          setStatus('Cleared access token. This device will stay local-only.')
          setCloud({ state: 'unconfigured' })
          return
        }
        setAccessToken(token)
        setApiBase(apiBase.trim() || DEFAULT_CLOUD_API)

        const local = await getLocalStats()
        const statusNow = await fetchCloudStatus()
        setCloud(statusNow)

        // If this browser has the real Log/Regimen, upload it instead of pulling seeds.
        const cloudIsEmptyOrSeed =
          statusNow.state === 'ok' &&
          (statusNow.empty ||
            (statusNow.regimenCount === 0 && statusNow.exerciseCount <= 6))
        if (
          cloudIsEmptyOrSeed &&
          (local.regimens > 0 || local.days > 0 || local.exercises > 6)
        ) {
          const { updatedAt } = await pushToCloud()
          await refreshCloud()
          setStatus(
            `Uploaded this browser’s data to Cloudflare (${new Date(updatedAt).toLocaleString()}). Open the Worker URL on your phone with the same token.`,
          )
          return
        }

        const result = await pullFromCloud()
        await refreshCloud()
        if (result.skipped) {
          setStatus(result.reason || 'Kept local data. Tap Upload to replace the cloud copy.')
          return
        }
        setStatus(
          result.empty
            ? 'Connected. Cloud is empty — tap “Upload this device to cloud”.'
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
      setAccessToken(token)
      setApiBase(apiBase.trim() || DEFAULT_CLOUD_API)
      const local = await getLocalStats()
      if (local.exercises === 0 && local.regimens === 0) {
        setStatus(
          'This browser has no Log/Regimen to upload. Open the site where you originally added them (usually GitHub Pages), then upload from there.',
        )
        return
      }
      const { updatedAt } = await pushToCloud()
      await refreshCloud()
      setStatus(
        `Uploaded ${local.exercises} exercises / ${local.regimens} regimens to Cloudflare (${new Date(updatedAt).toLocaleString()}).`,
      )
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
      setAccessToken(token)
      setApiBase(apiBase.trim() || DEFAULT_CLOUD_API)
      const result = await pullFromCloud({ force: true })
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
      ? 'Not connected yet'
      : cloud.state === 'error'
        ? cloud.message
        : cloud.empty
          ? 'Connected — cloud empty'
          : `Connected — ${cloud.exerciseCount} exercises, ${cloud.regimenCount} regimens` +
            (cloud.updatedAt ? ` · ${new Date(cloud.updatedAt).toLocaleString()}` : '')

  return (
    <div className="view">
      <header className="view-head">
        <h1>Backup</h1>
        <p className="muted">Upload the Log/Regimen from this browser into Cloudflare D1.</p>
      </header>

      {counts && (
        <div className="card">
          <div className="card-title">On this device (this browser only)</div>
          <div className="card-sub muted">
            {counts.exercises} exercises · {counts.schemes} schemes · {counts.regimens} regimens ·{' '}
            {counts.days} days · {counts.bodyweights} weigh-ins
          </div>
        </div>
      )}

      <div className="card backup-note">
        <div className="card-title">Migrate to Cloudflare</div>
        <p className="muted backup-help">
          Data does not move by itself. It stays in the browser where you typed it (often{' '}
          <strong>GitHub Pages</strong>). Open that same site, connect with the token, then tap
          Upload.
        </p>
        {onGithubPages && hasRealLocalData && (
          <p className="backup-status">
            This looks like the browser that has your real data — upload from here.
          </p>
        )}
        {!hasRealLocalData && counts && (
          <p className="muted backup-help">
            This browser only has demo/empty data. Switch to the original site/device where you
            added exercises, then upload.
          </p>
        )}
        <p className="backup-status cloud-status">{cloudLabel}</p>

        <label className="field grow" style={{ marginTop: 12 }}>
          <span>API URL</span>
          <input
            value={apiBase}
            onChange={(e) => setApiBaseDraft(e.target.value)}
            placeholder={DEFAULT_CLOUD_API}
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <label className="field grow" style={{ marginTop: 12 }}>
          <span>Access token</span>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Worker ACCESS_TOKEN"
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
        <button
          className="btn primary block"
          type="button"
          disabled={busy || !token.trim()}
          onClick={() => void uploadDevice()}
        >
          Upload this device to cloud
        </button>
        <button
          className="btn block"
          type="button"
          disabled={busy || !token.trim()}
          onClick={() => void downloadCloud()}
        >
          Download cloud to this device (overwrite local)
        </button>
      </div>

      <div className="card backup-note">
        <div className="card-title">File backup</div>
        <p className="muted backup-help">Optional offline copy.</p>
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
      {!cloudConfigured() && !token && (
        <p className="muted backup-help">
          Worker: {DEFAULT_CLOUD_API}
        </p>
      )}
    </div>
  )
}
