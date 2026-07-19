import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, schemeLabel } from '../db'
import { fmtWeight } from '../format'

async function persistSchemeWeight(schemeId: number, raw: string) {
  const v = parseFloat(raw)
  const updatedAt = Date.now()
  if (!raw.trim() || Number.isNaN(v) || v < 0) {
    await db.schemes.update(schemeId, { weight: undefined, updatedAt })
    return
  }
  await db.schemes.update(schemeId, { weight: v, updatedAt })
}

async function createExercise(name: string) {
  const id = await db.exercises.add({ name, unit: 'kg', createdAt: Date.now() })
  await db.schemes.bulkAdd([
    { exerciseId: id, sets: 3, reps: 10 },
    { exerciseId: id, sets: 4, reps: 8 },
  ])
  return id
}

function ExerciseRow({ exerciseId }: { exerciseId: number }) {
  const exercise = useLiveQuery(() => db.exercises.get(exerciseId), [exerciseId])
  const schemes = useLiveQuery(
    () => db.schemes.where('exerciseId').equals(exerciseId).toArray(),
    [exerciseId],
  )

  const [schemeId, setSchemeId] = useState<number | null>(null)
  const [draftWeight, setDraftWeight] = useState<string | null>(null)
  const [addingScheme, setAddingScheme] = useState(false)
  const [newSets, setNewSets] = useState('3')
  const [newReps, setNewReps] = useState('10')

  const list = (schemes ?? []).slice().sort((a, b) => a.sets - b.sets || a.reps - b.reps)
  const activeId =
    schemeId != null && list.some((s) => s.id === schemeId) ? schemeId : (list[0]?.id ?? null)
  const selected = list.find((s) => s.id === activeId)
  const weight =
    draftWeight ?? (selected?.weight != null ? String(selected.weight) : '')

  if (!exercise) return null

  async function addScheme() {
    const sets = parseInt(newSets, 10)
    const reps = parseInt(newReps, 10)
    if (!sets || !reps || sets < 1 || reps < 1) return
    const existing = list.find((s) => s.sets === sets && s.reps === reps)
    if (existing) {
      setSchemeId(existing.id!)
      setDraftWeight(null)
      setAddingScheme(false)
      return
    }
    const id = await db.schemes.add({ exerciseId, sets, reps })
    setSchemeId(id)
    setDraftWeight(null)
    setAddingScheme(false)
  }

  async function deleteExercise() {
    if (!confirm(`Remove ${exercise!.name}?`)) return
    await db.schemes.where('exerciseId').equals(exerciseId).delete()
    await db.exercises.delete(exerciseId)
    const days = await db.regimenDays.toArray()
    await Promise.all(
      days
        .filter((d) => d.exercises.some((e) => e.exerciseId === exerciseId))
        .map((d) =>
          db.regimenDays.update(d.id!, {
            exercises: d.exercises.filter((e) => e.exerciseId !== exerciseId),
          }),
        ),
    )
  }

  const unit = exercise.unit || 'kg'

  return (
    <article className="ex-row">
      <div className="ex-row-top">
        <h2 className="ex-name">{exercise.name}</h2>
        <button className="link-btn danger-link" onClick={deleteExercise} type="button">
          Remove
        </button>
      </div>

      <div className="ex-controls">
        <label className="field">
          <span>Sets × reps</span>
          <select
            value={activeId ?? ''}
            onChange={(e) => {
              const v = e.target.value
              if (v === '__add__') {
                setAddingScheme(true)
                return
              }
              setSchemeId(Number(v))
              setDraftWeight(null)
            }}
          >
            {list.length === 0 && <option value="">No schemes</option>}
            {list.map((s) => (
              <option key={s.id} value={s.id}>
                {schemeLabel(s)}
                {s.weight != null ? ` · ${fmtWeight(s.weight, unit)}` : ''}
              </option>
            ))}
            <option value="__add__">+ Add sets × reps…</option>
          </select>
        </label>

        <label className="field grow">
          <span>Weight ({unit})</span>
          <input
            inputMode="decimal"
            value={weight}
            placeholder="—"
            disabled={!selected}
            onChange={(e) => setDraftWeight(e.target.value)}
            onBlur={() => {
              if (draftWeight != null && selected?.id) {
                void persistSchemeWeight(selected.id, draftWeight).then(() => setDraftWeight(null))
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                ;(e.target as HTMLInputElement).blur()
              }
            }}
          />
        </label>
      </div>

      {addingScheme && (
        <div className="scheme-add">
          <label className="field">
            <span>Sets</span>
            <input
              inputMode="numeric"
              value={newSets}
              onChange={(e) => setNewSets(e.target.value)}
            />
          </label>
          <span className="times">×</span>
          <label className="field">
            <span>Reps</span>
            <input
              inputMode="numeric"
              value={newReps}
              onChange={(e) => setNewReps(e.target.value)}
            />
          </label>
          <button className="btn primary" type="button" onClick={() => void addScheme()}>
            Add
          </button>
          <button className="link-btn" type="button" onClick={() => setAddingScheme(false)}>
            Cancel
          </button>
        </div>
      )}
    </article>
  )
}

export default function LogView() {
  const exercises = useLiveQuery(() => db.exercises.orderBy('name').toArray())
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')

  async function addExercise() {
    const n = name.trim()
    if (!n) return
    await createExercise(n)
    setName('')
  }

  const q = query.trim().toLowerCase()
  const filtered = (exercises ?? []).filter((ex) => !q || ex.name.toLowerCase().includes(q))

  return (
    <div className="view">
      <header className="view-head">
        <h1>Log</h1>
        <p className="muted">Working weight per sets × reps.</p>
      </header>

      <div className="log-form">
        <label className="field grow">
          <span>New exercise</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Romanian Deadlift"
            onKeyDown={(e) => e.key === 'Enter' && void addExercise()}
          />
        </label>
        <button className="btn primary" type="button" onClick={() => void addExercise()}>
          Add
        </button>
      </div>

      {(exercises ?? []).length > 0 && (
        <label className="field grow search-field">
          <span>Search</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter exercises"
            autoComplete="off"
          />
        </label>
      )}

      <div className="ex-list">
        {filtered.map((ex) => (
          <ExerciseRow key={ex.id} exerciseId={ex.id!} />
        ))}
        {(exercises ?? []).length === 0 && (
          <div className="empty">
            <p>No exercises yet.</p>
            <p className="muted">Add a lift to start tracking weights.</p>
          </div>
        )}
        {(exercises ?? []).length > 0 && filtered.length === 0 && (
          <div className="empty">
            <p>No matches.</p>
            <p className="muted">Try a different search.</p>
          </div>
        )}
      </div>
    </div>
  )
}
