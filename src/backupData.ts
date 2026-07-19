import { db, todayISO, type BodyWeight, type Exercise, type Regimen, type RegimenDay, type Scheme } from './db'

/** Current backup / cloud snapshot schema. */
export const BACKUP_SCHEMA_VERSION = 2

export interface BackupData {
  app: 'gym-tracker'
  schemaVersion: number
  exportedAt: string
  exercises: Exercise[]
  schemes: Scheme[]
  regimens: Regimen[]
  regimenDays: RegimenDay[]
  bodyweights: BodyWeight[]
}

export function isBackupData(value: unknown): value is BackupData {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    v.app === 'gym-tracker' &&
    typeof v.schemaVersion === 'number' &&
    Array.isArray(v.exercises) &&
    Array.isArray(v.schemes) &&
    Array.isArray(v.regimens) &&
    Array.isArray(v.regimenDays) &&
    Array.isArray(v.bodyweights)
  )
}

export async function buildBackup(): Promise<BackupData> {
  const [exercises, schemes, regimens, regimenDays, bodyweights] = await Promise.all([
    db.exercises.toArray(),
    db.schemes.toArray(),
    db.regimens.toArray(),
    db.regimenDays.toArray(),
    db.bodyweights.toArray(),
  ])
  return {
    app: 'gym-tracker',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    exercises,
    schemes,
    regimens,
    regimenDays,
    bodyweights,
  }
}

export async function replaceLocalFromBackup(data: BackupData): Promise<void> {
  await db.transaction(
    'rw',
    [db.exercises, db.schemes, db.regimens, db.regimenDays, db.bodyweights],
    async () => {
      await Promise.all([
        db.exercises.clear(),
        db.schemes.clear(),
        db.regimens.clear(),
        db.regimenDays.clear(),
        db.bodyweights.clear(),
      ])
      if (data.exercises.length) await db.exercises.bulkAdd(data.exercises)
      if (data.schemes.length) await db.schemes.bulkAdd(data.schemes)
      if (data.regimens.length) await db.regimens.bulkAdd(data.regimens)
      if (data.regimenDays.length) await db.regimenDays.bulkAdd(data.regimenDays)
      if (data.bodyweights.length) await db.bodyweights.bulkAdd(data.bodyweights)
    },
  )
}

export function backupFilename(): string {
  return `gym-tracker-backup-${todayISO()}.json`
}
