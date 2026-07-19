import Dexie, { type Table } from 'dexie'

export interface Exercise {
  id?: number
  name: string
  unit: string // 'kg' | 'lb'
  createdAt: number
}

/** A sets×reps prescription the user can pick for an exercise (e.g. 3×10). */
export interface Scheme {
  id?: number
  exerciseId: number
  sets: number
  reps: number
  /** Working weight saved for this specific sets×reps selection. */
  weight?: number
  updatedAt?: number
}

export interface Regimen {
  id?: number
  name: string
  createdAt: number
}

/** An exercise slotted into a regimen day, with its own sets×reps choice. */
export interface DayExercise {
  exerciseId: number
  /** Scheme chosen for this day — independent of whatever is selected in Log. */
  schemeId?: number
}

/** One day / session within a regimen (Push, Pull, Week A, …). */
export interface RegimenDay {
  id?: number
  regimenId: number
  name: string
  order: number
  exercises: DayExercise[]
}

export interface BodyWeight {
  id?: number
  date: string
  ts: number
  kg: number
}

class GymDB extends Dexie {
  exercises!: Table<Exercise, number>
  schemes!: Table<Scheme, number>
  regimens!: Table<Regimen, number>
  regimenDays!: Table<RegimenDay, number>
  bodyweights!: Table<BodyWeight, number>

  constructor() {
    // Fresh store for the Log / Regimen / Weight model.
    super('gym-tracker-v2')
    this.version(1).stores({
      exercises: '++id, name',
      schemes: '++id, exerciseId, [exerciseId+sets+reps]',
      regimens: '++id, name',
      regimenDays: '++id, regimenId, order',
      bodyweights: '++id, date, ts',
    })
    this.version(2)
      .stores({
        exercises: '++id, name',
        schemes: '++id, exerciseId, [exerciseId+sets+reps]',
        regimens: '++id, name',
        regimenDays: '++id, regimenId, order',
        bodyweights: '++id, date, ts',
      })
      .upgrade(async (tx) => {
        await tx
          .table('regimenDays')
          .toCollection()
          .modify((day: Record<string, unknown>) => {
            const legacyIds = day.exerciseIds
            if (Array.isArray(legacyIds) && !Array.isArray(day.exercises)) {
              day.exercises = legacyIds.map((exerciseId: number) => ({ exerciseId }))
            } else if (!Array.isArray(day.exercises)) {
              day.exercises = []
            }
            delete day.exerciseIds
          })
      })
  }
}

export const db = new GymDB()

export function todayISO(d = new Date()): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

export function schemeLabel(s: Pick<Scheme, 'sets' | 'reps'>): string {
  return `${s.sets}×${s.reps}`
}

export function sortSchemes<T extends Pick<Scheme, 'sets' | 'reps'>>(list: T[]): T[] {
  return list.slice().sort((a, b) => a.sets - b.sets || a.reps - b.reps)
}

export async function ensureSeed() {
  if ((await db.exercises.count()) > 0) return
  const now = Date.now()
  const names = ['Squat', 'Bench Press', 'Deadlift', 'Overhead Press', 'Pull-up', 'Row']
  const ids = await db.exercises.bulkAdd(
    names.map((name) => ({ name, unit: 'kg', createdAt: now })),
    { allKeys: true },
  )
  const defaultSchemes: Omit<Scheme, 'id'>[] = []
  for (const exerciseId of ids as number[]) {
    defaultSchemes.push(
      { exerciseId, sets: 3, reps: 10 },
      { exerciseId, sets: 4, reps: 8 },
      { exerciseId, sets: 5, reps: 5 },
    )
  }
  await db.schemes.bulkAdd(defaultSchemes as Scheme[])
}
