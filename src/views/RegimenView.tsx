import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, schemeLabel } from '../db'
import { fmtWeight } from '../format'

export default function RegimenListView() {
  const regimens = useLiveQuery(() => db.regimens.orderBy('createdAt').reverse().toArray())
  const days = useLiveQuery(() => db.regimenDays.toArray())
  const [name, setName] = useState('')

  const dayCount = new Map<number, number>()
  for (const d of days ?? []) {
    dayCount.set(d.regimenId, (dayCount.get(d.regimenId) ?? 0) + 1)
  }

  async function createRegimen() {
    const n = name.trim()
    if (!n) return
    const id = await db.regimens.add({ name: n, createdAt: Date.now() })
    // Start with one empty day so the user can name / fill it immediately.
    await db.regimenDays.add({
      regimenId: id,
      name: 'Day 1',
      order: 0,
      exerciseIds: [],
    })
    setName('')
  }

  return (
    <div className="view">
      <header className="view-head">
        <h1>Regimen</h1>
        <p className="muted">Push / Pull, Week A / B — build days from your Log.</p>
      </header>

      <div className="log-form">
        <label className="field grow">
          <span>New regimen</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Push Pull Legs"
            onKeyDown={(e) => e.key === 'Enter' && createRegimen()}
          />
        </label>
        <button className="btn primary" type="button" onClick={createRegimen}>
          Add
        </button>
      </div>

      <div className="card-list">
        {(regimens ?? []).map((r) => (
          <Link to={`/regimen/${r.id}`} className="card" key={r.id}>
            <div className="card-title">{r.name}</div>
            <div className="card-sub muted">
              {dayCount.get(r.id!) ?? 0} day{(dayCount.get(r.id!) ?? 0) === 1 ? '' : 's'}
            </div>
          </Link>
        ))}
        {(regimens ?? []).length === 0 && (
          <div className="empty">
            <p>No regimens yet.</p>
            <p className="muted">Create a split, then assign exercises to each day.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export function RegimenDetailView() {
  const { id } = useParams()
  const rId = Number(id)
  const navigate = useNavigate()
  const regimen = useLiveQuery(() => db.regimens.get(rId), [rId])
  const days = useLiveQuery(
    () => db.regimenDays.where('regimenId').equals(rId).sortBy('order'),
    [rId],
  )
  const exercises = useLiveQuery(() => db.exercises.orderBy('name').toArray())
  const schemes = useLiveQuery(() => db.schemes.toArray())

  const [renamingDay, setRenamingDay] = useState<number | null>(null)
  const [dayNameDraft, setDayNameDraft] = useState('')
  const [pickingFor, setPickingFor] = useState<number | null>(null)
  const [newDayName, setNewDayName] = useState('')

  if (!regimen) return <div className="view" />

  const exMap = new Map((exercises ?? []).map((e) => [e.id!, e]))
  const schemesByEx = new Map<number, typeof schemes>()
  for (const s of schemes ?? []) {
    const arr = schemesByEx.get(s.exerciseId) ?? []
    arr.push(s)
    schemesByEx.set(s.exerciseId, arr)
  }

  function workingWeight(exerciseId: number): string {
    const list = schemesByEx.get(exerciseId) ?? []
    const withWeight = list.filter((s) => s!.weight != null)
    if (withWeight.length === 0) return 'No weight set'
    // Prefer the most recently updated scheme with a weight.
    const best = [...withWeight].sort((a, b) => (b!.updatedAt ?? 0) - (a!.updatedAt ?? 0))[0]!
    const unit = exMap.get(exerciseId)?.unit || 'kg'
    return `${schemeLabel(best)} @ ${fmtWeight(best.weight!, unit)}`
  }

  async function addDay() {
    const name = newDayName.trim() || `Day ${(days?.length ?? 0) + 1}`
    const order = (days?.length ?? 0)
    await db.regimenDays.add({
      regimenId: rId,
      name,
      order,
      exerciseIds: [],
    })
    setNewDayName('')
  }

  async function renameDay(dayId: number) {
    const name = dayNameDraft.trim()
    if (!name) return
    await db.regimenDays.update(dayId, { name })
    setRenamingDay(null)
  }

  async function addExerciseToDay(dayId: number, exerciseId: number) {
    const day = days?.find((d) => d.id === dayId)
    if (!day || day.exerciseIds.includes(exerciseId)) return
    await db.regimenDays.update(dayId, { exerciseIds: [...day.exerciseIds, exerciseId] })
    setPickingFor(null)
  }

  async function removeExerciseFromDay(dayId: number, exerciseId: number) {
    const day = days?.find((d) => d.id === dayId)
    if (!day) return
    await db.regimenDays.update(dayId, {
      exerciseIds: day.exerciseIds.filter((x) => x !== exerciseId),
    })
  }

  async function deleteDay(dayId: number) {
    if (!confirm('Delete this day?')) return
    await db.regimenDays.delete(dayId)
  }

  async function deleteRegimen() {
    if (!confirm(`Delete regimen "${regimen!.name}"?`)) return
    await db.regimenDays.where('regimenId').equals(rId).delete()
    await db.regimens.delete(rId)
    navigate('/regimen')
  }

  return (
    <div className="view">
      <header className="view-head with-back">
        <button className="back" type="button" onClick={() => navigate('/regimen')} aria-label="back">
          ‹
        </button>
        <div>
          <h1>{regimen.name}</h1>
          <p className="muted">{days?.length ?? 0} days</p>
        </div>
      </header>

      {(days ?? []).map((day) => {
        const available = (exercises ?? []).filter((e) => !day.exerciseIds.includes(e.id!))
        return (
          <section className="day-block" key={day.id}>
            <div className="day-head">
              {renamingDay === day.id ? (
                <div className="log-form compact">
                  <input
                    value={dayNameDraft}
                    onChange={(e) => setDayNameDraft(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && renameDay(day.id!)}
                  />
                  <button className="btn primary" type="button" onClick={() => renameDay(day.id!)}>
                    Save
                  </button>
                </div>
              ) : (
                <>
                  <h2>{day.name}</h2>
                  <div className="day-actions">
                    <button
                      className="link-btn"
                      type="button"
                      onClick={() => {
                        setRenamingDay(day.id!)
                        setDayNameDraft(day.name)
                      }}
                    >
                      Rename
                    </button>
                    <button className="link-btn danger-link" type="button" onClick={() => deleteDay(day.id!)}>
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>

            <ul className="day-ex-list">
              {day.exerciseIds.map((exId) => {
                const ex = exMap.get(exId)
                if (!ex) return null
                return (
                  <li key={exId} className="day-ex">
                    <div>
                      <div className="card-title">{ex.name}</div>
                      <div className="card-sub muted">{workingWeight(exId)}</div>
                    </div>
                    <button
                      className="x"
                      type="button"
                      aria-label="remove"
                      onClick={() => removeExerciseFromDay(day.id!, exId)}
                    >
                      ×
                    </button>
                  </li>
                )
              })}
              {day.exerciseIds.length === 0 && (
                <li className="muted day-empty">No exercises — pick from your Log.</li>
              )}
            </ul>

            {pickingFor === day.id ? (
              <div className="add-pick">
                {available.map((e) => (
                  <button
                    key={e.id}
                    className="btn block"
                    type="button"
                    onClick={() => addExerciseToDay(day.id!, e.id!)}
                  >
                    {e.name}
                  </button>
                ))}
                {available.length === 0 && (
                  <p className="muted">
                    {(exercises ?? []).length === 0
                      ? 'Add exercises in Log first.'
                      : 'All Log exercises are already on this day.'}
                  </p>
                )}
                <button className="link-btn" type="button" onClick={() => setPickingFor(null)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button className="btn block" type="button" onClick={() => setPickingFor(day.id!)}>
                + Add exercise
              </button>
            )}
          </section>
        )
      })}

      <div className="log-form">
        <label className="field grow">
          <span>New day</span>
          <input
            value={newDayName}
            onChange={(e) => setNewDayName(e.target.value)}
            placeholder="e.g. Push, Pull, Week A"
            onKeyDown={(e) => e.key === 'Enter' && addDay()}
          />
        </label>
        <button className="btn primary" type="button" onClick={addDay}>
          Add day
        </button>
      </div>

      <button className="btn danger block" type="button" onClick={deleteRegimen}>
        Delete regimen
      </button>
    </div>
  )
}
