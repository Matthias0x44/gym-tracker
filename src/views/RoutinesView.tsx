import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'

export default function RoutinesView() {
  const routines = useLiveQuery(() => db.routines.toArray())
  const exercises = useLiveQuery(() => db.exercises.toArray())
  const [name, setName] = useState('')

  const exMap = new Map((exercises ?? []).map((e) => [e.id!, e]))

  async function createRoutine() {
    if (!name.trim()) return
    await db.routines.add({ name: name.trim(), exerciseIds: [], createdAt: Date.now() })
    setName('')
  }

  return (
    <div className="view">
      <header className="view-head">
        <h1>Routines</h1>
        <p className="muted">Optional templates — for when you're training to a plan.</p>
      </header>

      <div className="log-form">
        <label className="field grow">
          <span>New routine</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Push A, Full Body"
            onKeyDown={(e) => e.key === 'Enter' && createRoutine()}
          />
        </label>
        <button className="btn primary" onClick={createRoutine}>
          Add
        </button>
      </div>

      <div className="card-list">
        {(routines ?? []).map((r) => (
          <Link to={`/routine/${r.id}`} className="card" key={r.id}>
            <div className="card-title">{r.name}</div>
            <div className="card-sub muted">
              {r.exerciseIds.length === 0
                ? 'No exercises yet'
                : r.exerciseIds.map((id) => exMap.get(id)?.name).filter(Boolean).join(' · ')}
            </div>
          </Link>
        ))}
        {(routines ?? []).length === 0 && <p className="muted">No routines yet.</p>}
      </div>
    </div>
  )
}
