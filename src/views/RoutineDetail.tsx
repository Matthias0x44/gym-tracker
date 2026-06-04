import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import InlineLogger from '../components/InlineLogger'

export default function RoutineDetail() {
  const { id } = useParams()
  const rId = Number(id)
  const navigate = useNavigate()
  const routine = useLiveQuery(() => db.routines.get(rId), [rId])
  const exercises = useLiveQuery(() => db.exercises.where('archived').equals(0).toArray())
  const [adding, setAdding] = useState(false)

  if (!routine) return <div className="view" />

  const exMap = new Map((exercises ?? []).map((e) => [e.id!, e]))
  const inRoutine = routine.exerciseIds.map((id) => exMap.get(id)).filter(Boolean)
  const available = (exercises ?? []).filter((e) => !routine.exerciseIds.includes(e.id!))

  async function addExercise(exId: number) {
    await db.routines.update(rId, { exerciseIds: [...routine!.exerciseIds, exId] })
    setAdding(false)
  }
  async function removeExercise(exId: number) {
    await db.routines.update(rId, {
      exerciseIds: routine!.exerciseIds.filter((x) => x !== exId),
    })
  }
  async function deleteRoutine() {
    if (!confirm(`Delete routine "${routine!.name}"?`)) return
    await db.routines.delete(rId)
    navigate('/routines')
  }

  return (
    <div className="view">
      <header className="view-head with-back">
        <button className="back" onClick={() => navigate(-1)} aria-label="back">
          ‹
        </button>
        <div>
          <h1>{routine.name}</h1>
          <p className="muted">{inRoutine.length} exercises</p>
        </div>
      </header>

      {inRoutine.length === 0 && (
        <p className="muted">Add exercises below, then log them in order during your session.</p>
      )}

      {inRoutine.map((ex) => (
        <div className="routine-ex" key={ex!.id}>
          <div className="routine-ex-head">
            <h2>{ex!.name}</h2>
            <button className="link-btn" onClick={() => removeExercise(ex!.id!)}>
              remove
            </button>
          </div>
          <InlineLogger exercise={ex!} />
        </div>
      ))}

      {adding ? (
        <div className="add-pick">
          {available.map((e) => (
            <button key={e.id} className="btn block" onClick={() => addExercise(e.id!)}>
              {e.name}
            </button>
          ))}
          {available.length === 0 && <p className="muted">All exercises already added.</p>}
          <button className="link-btn" onClick={() => setAdding(false)}>
            cancel
          </button>
        </div>
      ) : (
        <button className="btn block" onClick={() => setAdding(true)}>
          + Add exercise
        </button>
      )}

      <button className="btn danger block" onClick={deleteRoutine}>
        Delete routine
      </button>
    </div>
  )
}
