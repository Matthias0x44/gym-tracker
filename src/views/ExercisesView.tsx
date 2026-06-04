import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, todayISO, type ExerciseCategory } from '../db'
import { groupSessions, suggestProgression } from '../progression'
import { fmtSet, relTime } from '../format'

export default function ExercisesView() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<ExerciseCategory>('strength')
  const exercises = useLiveQuery(() => db.exercises.where('archived').equals(0).toArray())
  const allSets = useLiveQuery(() => db.sets.toArray())

  const setsByEx = new Map<number, typeof allSets>()
  for (const s of allSets ?? []) {
    const arr = setsByEx.get(s.exerciseId) ?? []
    arr.push(s)
    setsByEx.set(s.exerciseId, arr)
  }

  const query = q.trim().toLowerCase()
  const filtered = (exercises ?? [])
    .filter((e) => e.name.toLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name))
  const exactMatch = (exercises ?? []).some((e) => e.name.toLowerCase() === query)

  async function createExercise() {
    const name = q.trim()
    if (!name) return
    const id = await db.exercises.add({
      name,
      category: cat,
      unit: cat === 'strength' ? 'kg' : '',
      createdAt: Date.now(),
      archived: 0,
    })
    navigate(`/exercise/${id}`)
  }

  return (
    <div className="view">
      <header className="view-head">
        <h1>Exercises</h1>
      </header>

      <input
        className="search"
        placeholder="Search or add an exercise…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />

      {query && !exactMatch && (
        <div className="create-row">
          <span>
            Create <strong>"{q.trim()}"</strong>
          </span>
          <div className="seg">
            {(['strength', 'cardio', 'other'] as ExerciseCategory[]).map((c) => (
              <button
                key={c}
                className={`seg-btn ${cat === c ? 'active' : ''}`}
                onClick={() => setCat(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <button className="btn primary" onClick={createExercise}>
            Create
          </button>
        </div>
      )}

      <div className="card-list">
        {filtered.map((ex) => {
          const sessions = groupSessions(setsByEx.get(ex.id!) ?? [])
          const last = sessions[0]
          const suggestion = suggestProgression(sessions, ex.unit || 'kg')
          return (
            <Link to={`/exercise/${ex.id}`} className="card" key={ex.id}>
              <div className="card-row">
                <div className="card-title">{ex.name}</div>
                {suggestion && <span className="chip">{suggestion.text}</span>}
              </div>
              <div className="card-sub">
                {last ? (
                  <>
                    {last.topSet ? fmtSet(last.topSet, ex) : fmtSet(last.sets[last.sets.length - 1], ex)}
                    <span className="muted"> · {last.date === todayISO() ? 'today' : relTime(last.ts)}</span>
                  </>
                ) : (
                  <span className="muted">No history</span>
                )}
                {ex.target && <span className="target-tag">{ex.target}</span>}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
