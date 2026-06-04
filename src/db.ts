import Dexie, { type Table } from 'dexie'

export type ExerciseCategory = 'strength' | 'cardio' | 'other'

export interface Exercise {
  id?: number
  name: string
  category: ExerciseCategory
  unit: string // 'kg' | 'lb' for strength; '' for cardio/other
  target?: string // pinned free-text goal, e.g. "8×30/30 @ L7" or "100kg squat"
  createdAt: number
  archived: number // 0 | 1 — Dexie indexes numbers, not booleans
}

export interface SetEntry {
  id?: number
  exerciseId: number
  date: string // local 'YYYY-MM-DD', groups a session
  ts: number // full timestamp, orders within a day
  weight?: number // strength
  reps?: number // strength
  note?: string // cardio/other free input, e.g. "30s/30s ×8 @ L7"
}

export interface BodyWeight {
  id?: number
  date: string
  ts: number
  kg: number
}

export interface Routine {
  id?: number
  name: string
  exerciseIds: number[]
  createdAt: number
}

class GymDB extends Dexie {
  exercises!: Table<Exercise, number>
  sets!: Table<SetEntry, number>
  bodyweights!: Table<BodyWeight, number>
  routines!: Table<Routine, number>

  constructor() {
    super('gym-tracker')
    this.version(1).stores({
      exercises: '++id, name, category, archived',
      sets: '++id, exerciseId, date, ts',
      bodyweights: '++id, date, ts',
      routines: '++id, name',
    })
  }
}

export const db = new GymDB()

export function todayISO(d = new Date()): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

export async function ensureSeed() {
  if ((await db.exercises.count()) > 0) return
  const now = Date.now()
  const defaults: Omit<Exercise, 'id'>[] = [
    { name: 'Squat', category: 'strength', unit: 'kg', createdAt: now, archived: 0 },
    { name: 'Bench Press', category: 'strength', unit: 'kg', createdAt: now, archived: 0 },
    { name: 'Deadlift', category: 'strength', unit: 'kg', createdAt: now, archived: 0 },
    { name: 'Overhead Press', category: 'strength', unit: 'kg', createdAt: now, archived: 0 },
    { name: 'Pull-up', category: 'strength', unit: 'kg', createdAt: now, archived: 0 },
    { name: 'HIIT Cycle', category: 'cardio', unit: '', createdAt: now, archived: 0 },
    { name: 'Run', category: 'cardio', unit: '', createdAt: now, archived: 0 },
  ]
  await db.exercises.bulkAdd(defaults as Exercise[])
}
