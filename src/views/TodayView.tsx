import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, todayISO } from '../db'
import { fmtSet } from '../format'

export default function TodayView() {
  const today = todayISO()
  const sets = useLiveQuery(() => db.sets.where('date').equals(today).toArray(), [today])
  const exercises = useLiveQuery(() => db.exercises.toArray())
  const bw = useLiveQuery(() => db.bodyweights.where('date').equals(today).first(), [today])

  const exMap = new Map((exercises ?? []).map((e) => [e.id!, e]))
  const groups = new Map<number, typeof sets>()
  for (const s of sets ?? []) {
    const arr = groups.get(s.exerciseId) ?? []
    arr.push(s)
    groups.set(s.exerciseId, arr)
  }

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="view">
      <header className="view-head">
        <h1>Today</h1>
        <p className="muted">{dateLabel}</p>
      </header>

      {!bw && (
        <Link to="/weight" className="banner">
          Log today's body weight →
        </Link>
      )}

      {groups.size === 0 ? (
        <div className="empty">
          <p>Nothing logged yet.</p>
          <p className="muted">Pick a lift to log a set, or run a routine.</p>
        </div>
      ) : (
        <div className="card-list">
          {[...groups.entries()].map(([exId, exSets]) => {
            const ex = exMap.get(exId)
            if (!ex) return null
            return (
              <Link to={`/exercise/${exId}`} className="card" key={exId}>
                <div className="card-title">{ex.name}</div>
                <div className="set-pills">
                  {exSets!.map((s) => (
                    <span key={s.id} className="set-pill static">
                      {fmtSet(s, ex)}
                    </span>
                  ))}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <div className="action-row">
        <Link to="/exercises" className="btn primary block">
          + Log an exercise
        </Link>
        <Link to="/routines" className="btn block">
          Start a routine
        </Link>
      </div>
    </div>
  )
}
