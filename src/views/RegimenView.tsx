import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, schemeLabel, sortSchemes, type DayExercise, type Scheme } from '../db'
import { fmtWeight } from '../format'

export default function RegimenListView() {
  const regimens = useLiveQuery(async () => {
    const rows = await db.regimens.toArray()
    return rows.sort((a, b) => b.createdAt - a.createdAt)
  })
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
      exercises: [],
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

function DayExerciseRow({
  entry,
  exerciseName,
  unit,
  schemes,
  onSchemeChange,
  onRemove,
}: {
  entry: DayExercise
  exerciseName: string
  unit: string
  schemes: Scheme[]
  onSchemeChange: (schemeId: number) => void
  onRemove: () => void
}) {
  const list = sortSchemes(schemes)
  const activeId =
    entry.schemeId != null && list.some((s) => s.id === entry.schemeId)
      ? entry.schemeId
      : (list[0]?.id ?? null)
  const selected = list.find((s) => s.id === activeId)
  const weightLabel =
    selected?.weight != null ? fmtWeight(selected.weight, unit) : 'No weight set'

  return (
    <li className="day-ex">
      <div className="day-ex-body">
        <div className="card-title">{exerciseName}</div>
        <label className="field">
          <span>Sets × reps</span>
          <select
            value={activeId ?? ''}
            disabled={list.length === 0}
            onChange={(e) => onSchemeChange(Number(e.target.value))}
          >
            {list.length === 0 && <option value="">No schemes in Log</option>}
            {list.map((s) => (
              <option key={s.id} value={s.id}>
                {schemeLabel(s)}
                {s.weight != null ? ` · ${fmtWeight(s.weight, unit)}` : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="card-sub muted">{weightLabel}</div>
      </div>
      <button className="x" type="button" aria-label="remove" onClick={onRemove}>
        ×
      </button>
    </li>
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
  const [pickQuery, setPickQuery] = useState('')
  const [newDayName, setNewDayName] = useState('')

  if (!regimen) return <div className="view" />

  const exMap = new Map((exercises ?? []).map((e) => [e.id!, e]))
  const schemesByEx = new Map<number, Scheme[]>()
  for (const s of schemes ?? []) {
    const arr = schemesByEx.get(s.exerciseId) ?? []
    arr.push(s)
    schemesByEx.set(s.exerciseId, arr)
  }

  async function addDay() {
    const name = newDayName.trim() || `Day ${(days?.length ?? 0) + 1}`
    const order = days?.length ?? 0
    await db.regimenDays.add({
      regimenId: rId,
      name,
      order,
      exercises: [],
    })
    setNewDayName('')
  }

  async function renameDay(dayId: number) {
    const name = dayNameDraft.trim()
    if (!name) return
    await db.regimenDays.update(dayId, { name })
    setRenamingDay(null)
  }

  function openPicker(dayId: number) {
    setPickQuery('')
    setPickingFor(dayId)
  }

  function closePicker() {
    setPickingFor(null)
    setPickQuery('')
  }

  async function addExerciseToDay(dayId: number, exerciseId: number) {
    const day = days?.find((d) => d.id === dayId)
    if (!day || day.exercises.some((e) => e.exerciseId === exerciseId)) return
    const list = sortSchemes(schemesByEx.get(exerciseId) ?? [])
    const entry: DayExercise = { exerciseId, schemeId: list[0]?.id }
    await db.regimenDays.update(dayId, { exercises: [...day.exercises, entry] })
    closePicker()
  }

  async function setDayExerciseScheme(dayId: number, exerciseId: number, schemeId: number) {
    const day = days?.find((d) => d.id === dayId)
    if (!day) return
    await db.regimenDays.update(dayId, {
      exercises: day.exercises.map((e) =>
        e.exerciseId === exerciseId ? { ...e, schemeId } : e,
      ),
    })
  }

  async function removeExerciseFromDay(dayId: number, exerciseId: number) {
    const day = days?.find((d) => d.id === dayId)
    if (!day) return
    await db.regimenDays.update(dayId, {
      exercises: day.exercises.filter((e) => e.exerciseId !== exerciseId),
    })
  }

  async function deleteDay(dayId: number) {
    if (!confirm('Delete this day?')) return
    await db.regimenDays.delete(dayId)
    const remaining = (days ?? []).filter((d) => d.id !== dayId)
    await Promise.all(remaining.map((d, i) => db.regimenDays.update(d.id!, { order: i })))
  }

  async function moveDay(dayId: number, direction: -1 | 1) {
    const list = [...(days ?? [])]
    const index = list.findIndex((d) => d.id === dayId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= list.length) return
    const [item] = list.splice(index, 1)
    list.splice(target, 0, item!)
    await Promise.all(list.map((d, i) => db.regimenDays.update(d.id!, { order: i })))
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

      {(days ?? []).map((day, dayIndex) => {
        const onDay = new Set(day.exercises.map((e) => e.exerciseId))
        const available = (exercises ?? []).filter((e) => !onDay.has(e.id!))
        const pickQ = pickQuery.trim().toLowerCase()
        const filteredAvailable = available.filter(
          (e) => !pickQ || e.name.toLowerCase().includes(pickQ),
        )
        const dayCount = days?.length ?? 0
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
                    {dayCount > 1 && (
                      <>
                        <button
                          className="link-btn"
                          type="button"
                          disabled={dayIndex === 0}
                          aria-label="Move day up"
                          onClick={() => void moveDay(day.id!, -1)}
                        >
                          ↑
                        </button>
                        <button
                          className="link-btn"
                          type="button"
                          disabled={dayIndex === dayCount - 1}
                          aria-label="Move day down"
                          onClick={() => void moveDay(day.id!, 1)}
                        >
                          ↓
                        </button>
                      </>
                    )}
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
              {day.exercises.map((entry) => {
                const ex = exMap.get(entry.exerciseId)
                if (!ex) return null
                return (
                  <DayExerciseRow
                    key={entry.exerciseId}
                    entry={entry}
                    exerciseName={ex.name}
                    unit={ex.unit || 'kg'}
                    schemes={schemesByEx.get(entry.exerciseId) ?? []}
                    onSchemeChange={(schemeId) =>
                      void setDayExerciseScheme(day.id!, entry.exerciseId, schemeId)
                    }
                    onRemove={() => void removeExerciseFromDay(day.id!, entry.exerciseId)}
                  />
                )
              })}
              {day.exercises.length === 0 && (
                <li className="muted day-empty">No exercises — pick from your Log.</li>
              )}
            </ul>

            {pickingFor === day.id ? (
              <div className="add-pick">
                {available.length > 0 && (
                  <label className="field grow">
                    <span>Search Log</span>
                    <input
                      type="search"
                      value={pickQuery}
                      onChange={(e) => setPickQuery(e.target.value)}
                      placeholder="Filter all exercises"
                      autoComplete="off"
                      autoFocus
                    />
                  </label>
                )}
                {available.length > 0 && (
                  <p className="muted add-pick-meta">
                    {pickQ
                      ? `${filteredAvailable.length} of ${available.length} available`
                      : `${available.length} exercise${available.length === 1 ? '' : 's'} from Log`}
                  </p>
                )}
                <div className="add-pick-list">
                  {filteredAvailable.map((e) => (
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
                  {available.length > 0 && filteredAvailable.length === 0 && (
                    <p className="muted">No matches in your Log.</p>
                  )}
                </div>
                <button className="link-btn" type="button" onClick={closePicker}>
                  Cancel
                </button>
              </div>
            ) : (
              <button className="btn block" type="button" onClick={() => openPicker(day.id!)}>
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
