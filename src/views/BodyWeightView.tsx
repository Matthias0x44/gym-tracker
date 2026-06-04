import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, todayISO } from '../db'
import { relTime } from '../format'

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const w = 320
  const h = 90
  const pad = 8
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2)
    const y = pad + (1 - (v - min) / span) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts.join(' ')} fill="none" stroke="currentColor" strokeWidth="2" />
      {pts.map((p, i) => {
        const [x, y] = p.split(',')
        return <circle key={i} cx={x} cy={y} r="2.5" fill="currentColor" />
      })}
    </svg>
  )
}

export default function BodyWeightView() {
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
  const change = list.length >= 2 ? latest.kg - list[0].kg : null

  return (
    <div className="view">
      <header className="view-head">
        <h1>Body weight</h1>
      </header>

      <div className="log-form">
        <label className="field grow">
          <span>Weight (kg)</span>
          <input
            inputMode="decimal"
            value={kg}
            onChange={(e) => setKg(e.target.value)}
            placeholder={latest ? String(latest.kg) : '0'}
            onKeyDown={(e) => e.key === 'Enter' && logWeight()}
          />
        </label>
        <button className="btn primary" onClick={logWeight}>
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
              {change.toFixed(1)}kg since start
            </div>
          )}
        </div>
      )}

      <div className="spark-wrap">
        <Sparkline values={list.map((e) => e.kg)} />
      </div>

      <section className="history">
        {desc.map((e) => (
          <div className="bw-row" key={e.id}>
            <span className="bw-row-kg">{e.kg}kg</span>
            <span className="muted">{relTime(e.ts)}</span>
            <button className="x" onClick={() => db.bodyweights.delete(e.id!)} aria-label="delete">
              ×
            </button>
          </div>
        ))}
        {list.length === 0 && <p className="muted">No entries yet.</p>}
      </section>
    </div>
  )
}
