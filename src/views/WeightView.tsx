import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, todayISO } from '../db'
import { relTime } from '../format'

const DAY_MS = 86400000

function WeightChart({ values }: { values: number[] }) {
  if (values.length < 2) {
    return (
      <div className="chart-empty muted">
        {values.length === 0 ? 'Log a few weigh-ins to see the graph.' : 'Need at least two entries for a trend.'}
      </div>
    )
  }
  const w = 320
  const h = 120
  const padX = 10
  const padY = 14
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => {
    const x = padX + (i / (values.length - 1)) * (w - padX * 2)
    const y = padY + (1 - (v - min) / span) * (h - padY * 2)
    return { x, y, v }
  })
  const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const area = `${padX},${h - padY} ${line} ${w - padX},${h - padY}`

  return (
    <div className="chart-wrap">
      <svg className="weight-chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="bwFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#bwFill)" />
        <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2.75" fill="currentColor" />
        ))}
      </svg>
      <div className="chart-scale">
        <span>{max.toFixed(1)}</span>
        <span>{min.toFixed(1)}</span>
      </div>
    </div>
  )
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

export default function WeightView() {
  const entries = useLiveQuery(() => db.bodyweights.orderBy('ts').toArray())
  const [kg, setKg] = useState('')

  async function logWeight() {
    const v = parseFloat(kg)
    if (!v || v <= 0) return
    const date = todayISO()
    const existing = await db.bodyweights.where('date').equals(date).first()
    if (existing) await db.bodyweights.update(existing.id!, { kg: v, ts: Date.now() })
    else await db.bodyweights.add({ date, ts: Date.now(), kg: v })
    setKg('')
  }

  const list = entries ?? []
  const desc = [...list].reverse()
  const latest = desc[0]
  const first = list[0]
  const change = latest && first && list.length >= 2 ? latest.kg - first.kg : null

  // Anchor windows to the latest entry so render stays pure (no Date.now()).
  const anchor = latest?.ts ?? 0
  const last7 = list.filter((e) => anchor - e.ts <= 7 * DAY_MS).map((e) => e.kg)
  const last30 = list.filter((e) => anchor - e.ts <= 30 * DAY_MS).map((e) => e.kg)
  const avg7 = avg(last7)
  const avg30 = avg(last30)

  return (
    <div className="view">
      <header className="view-head">
        <h1>Weight</h1>
        <p className="muted">Body weight over time.</p>
      </header>

      <div className="log-form">
        <label className="field grow">
          <span>Today (kg)</span>
          <input
            inputMode="decimal"
            value={kg}
            onChange={(e) => setKg(e.target.value)}
            placeholder={latest ? String(latest.kg) : '0'}
            onKeyDown={(e) => e.key === 'Enter' && logWeight()}
          />
        </label>
        <button className="btn primary" type="button" onClick={logWeight}>
          Log
        </button>
      </div>

      {latest && (
        <div className="bw-summary">
          <div className="bw-current">
            {latest.kg}
            <span className="unit">kg</span>
          </div>
          {change != null && (
            <div className={`bw-change ${change < 0 ? 'down' : change > 0 ? 'up' : ''}`}>
              {change > 0 ? '+' : ''}
              {change.toFixed(1)} kg since start
            </div>
          )}
        </div>
      )}

      <WeightChart values={list.map((e) => e.kg)} />

      {(avg7 != null || avg30 != null) && (
        <div className="stats-row">
          {avg7 != null && (
            <div className="stat">
              <span className="stat-label">7-day avg</span>
              <span className="stat-value">{avg7.toFixed(1)} kg</span>
            </div>
          )}
          {avg30 != null && (
            <div className="stat">
              <span className="stat-label">30-day avg</span>
              <span className="stat-value">{avg30.toFixed(1)} kg</span>
            </div>
          )}
          <div className="stat">
            <span className="stat-label">Entries</span>
            <span className="stat-value">{list.length}</span>
          </div>
        </div>
      )}

      <section className="history">
        {desc.map((e) => (
          <div className="bw-row" key={e.id}>
            <span className="bw-row-kg">{e.kg} kg</span>
            <span className="muted">{relTime(e.ts)}</span>
            <button
              className="x"
              type="button"
              onClick={() => db.bodyweights.delete(e.id!)}
              aria-label="delete"
            >
              ×
            </button>
          </div>
        ))}
        {list.length === 0 && <p className="muted">No entries yet.</p>}
      </section>
    </div>
  )
}
