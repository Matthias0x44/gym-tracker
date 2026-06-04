import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, todayISO, type Exercise, type SetEntry } from '../db'
import { groupSessions, suggestProgression } from '../progression'
import { fmtSet, relTime } from '../format'

// Self-contained log card: shows last session + auto progression, then a fast logging form.
// Reused by the exercise detail screen and by routine sessions.
export default function InlineLogger({ exercise }: { exercise: Exercise }) {
  const exId = exercise.id!
  const sets = useLiveQuery(() => db.sets.where('exerciseId').equals(exId).toArray(), [exId])
  const sessions = groupSessions(sets ?? [])
  const last = sessions[0]
  const prevDifferentDay = sessions.find((s) => s.date !== todayISO())
  const suggestion = suggestProgression(sessions, exercise.unit || 'kg')

  const strength = exercise.category === 'strength'
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [note, setNote] = useState('')
  const [prefilled, setPrefilled] = useState(false)

  // Prefill once from the most recent prior session's top set, so repeating is instant.
  useEffect(() => {
    if (prefilled || !sets) return
    const ref = prevDifferentDay?.topSet ?? last?.topSet
    if (strength && ref?.weight != null) {
      setWeight(String(ref.weight))
      if (ref.reps != null) setReps(String(ref.reps))
    }
    setPrefilled(true)
  }, [sets, prefilled, strength, prevDifferentDay, last])

  async function addSet() {
    const entry: SetEntry = { exerciseId: exId, date: todayISO(), ts: Date.now() }
    if (strength) {
      if (weight.trim() === '') return
      entry.weight = parseFloat(weight)
      if (reps.trim() !== '') entry.reps = parseInt(reps, 10)
    } else {
      if (note.trim() === '') return
      entry.note = note.trim()
    }
    await db.sets.add(entry)
    setNote('') // keep weight/reps for repeated sets; clear free-text note
  }

  const u = exercise.unit || 'kg'

  return (
    <div className="logger">
      <div className="logger-recall">
        {last ? (
          <span className="recall-last">
            Last: <strong>{last.topSet ? fmtSet(last.topSet, exercise) : fmtSet(last.sets[last.sets.length - 1], exercise)}</strong>
            <span className="muted"> · {relTime(last.ts)}</span>
          </span>
        ) : (
          <span className="muted">No history yet</span>
        )}
        {exercise.target && <span className="recall-target">{exercise.target}</span>}
      </div>

      {suggestion && (
        <div className="suggestion" title={suggestion.detail}>
          <span className="suggestion-chip">{suggestion.text}</span>
          <span className="suggestion-detail">{suggestion.detail}</span>
        </div>
      )}

      <div className="log-form">
        {strength ? (
          <>
            <label className="field">
              <span>Weight ({u})</span>
              <input
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="0"
              />
            </label>
            <label className="field">
              <span>Reps</span>
              <input
                inputMode="numeric"
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                placeholder="—"
              />
            </label>
          </>
        ) : (
          <label className="field grow">
            <span>Entry</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. 30s/30s ×8 @ L7"
              onKeyDown={(e) => e.key === 'Enter' && addSet()}
            />
          </label>
        )}
        <button className="btn primary" onClick={addSet}>
          Add set
        </button>
      </div>

      {last?.date === todayISO() && (
        <div className="today-sets">
          {last.sets.map((s) => (
            <span key={s.id} className="set-pill">
              {fmtSet(s, exercise)}
              <button className="x" onClick={() => db.sets.delete(s.id!)} aria-label="delete set">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
