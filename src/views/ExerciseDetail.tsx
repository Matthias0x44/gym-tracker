import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { groupSessions, bestSet } from '../progression'
import { fmtSet, relTime } from '../format'
import InlineLogger from '../components/InlineLogger'

export default function ExerciseDetail() {
  const { id } = useParams()
  const exId = Number(id)
  const navigate = useNavigate()
  const ex = useLiveQuery(() => db.exercises.get(exId), [exId])
  const sets = useLiveQuery(() => db.sets.where('exerciseId').equals(exId).toArray(), [exId])
  const [editingTarget, setEditingTarget] = useState(false)
  const [targetDraft, setTargetDraft] = useState('')

  if (!ex) return <div className="view" />

  const sessions = groupSessions(sets ?? [])
  const pb = bestSet(sets ?? [])

  async function saveTarget() {
    await db.exercises.update(exId, { target: targetDraft.trim() || undefined })
    setEditingTarget(false)
  }

  async function deleteExercise() {
    if (!confirm(`Delete ${ex!.name} and all its history?`)) return
    await db.sets.where('exerciseId').equals(exId).delete()
    await db.exercises.delete(exId)
    navigate('/exercises')
  }

  return (
    <div className="view">
      <header className="view-head with-back">
        <button className="back" onClick={() => navigate(-1)} aria-label="back">
          ‹
        </button>
        <div>
          <h1>{ex.name}</h1>
          <p className="muted">{ex.category}{pb?.weight != null && ` · PB ${fmtSet(pb, ex)}`}</p>
        </div>
      </header>

      <div className="target-block">
        {editingTarget ? (
          <div className="log-form">
            <label className="field grow">
              <span>Pinned target</span>
              <input
                value={targetDraft}
                onChange={(e) => setTargetDraft(e.target.value)}
                placeholder='e.g. "100kg squat" or "8×30/30 @ L7"'
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && saveTarget()}
              />
            </label>
            <button className="btn primary" onClick={saveTarget}>
              Save
            </button>
          </div>
        ) : ex.target ? (
          <button
            className="target-display"
            onClick={() => {
              setTargetDraft(ex.target ?? '')
              setEditingTarget(true)
            }}
          >
            <span className="muted">Target</span> {ex.target}
          </button>
        ) : (
          <button
            className="link-btn"
            onClick={() => {
              setTargetDraft('')
              setEditingTarget(true)
            }}
          >
            + Pin a target
          </button>
        )}
      </div>

      <InlineLogger exercise={ex} />

      <section className="history">
        <h2>History</h2>
        {sessions.length === 0 && <p className="muted">No sessions logged yet.</p>}
        {sessions.map((sess) => (
          <div className="session" key={sess.date}>
            <div className="session-date">
              {new Date(sess.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              <span className="muted"> · {relTime(sess.ts)}</span>
            </div>
            <div className="set-pills">
              {sess.sets.map((s) => (
                <span key={s.id} className="set-pill">
                  {fmtSet(s, ex)}
                  <button className="x" onClick={() => db.sets.delete(s.id!)} aria-label="delete">
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        ))}
      </section>

      <button className="btn danger block" onClick={deleteExercise}>
        Delete exercise
      </button>
    </div>
  )
}
