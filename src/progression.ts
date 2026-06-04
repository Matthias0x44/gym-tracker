import type { SetEntry } from './db'

export interface SessionSummary {
  date: string
  ts: number // latest ts in the session
  sets: SetEntry[]
  topSet: SetEntry | null // heaviest weighted set
}

const DAY = 86400000

export function groupSessions(sets: SetEntry[]): SessionSummary[] {
  const byDate = new Map<string, SetEntry[]>()
  for (const s of sets) {
    const arr = byDate.get(s.date) ?? []
    arr.push(s)
    byDate.set(s.date, arr)
  }
  const sessions: SessionSummary[] = []
  for (const [date, arr] of byDate) {
    arr.sort((a, b) => a.ts - b.ts)
    let topSet: SetEntry | null = null
    for (const s of arr) {
      if (s.weight == null) continue
      if (!topSet || s.weight > (topSet.weight ?? 0)) topSet = s
    }
    sessions.push({ date, ts: arr[arr.length - 1].ts, sets: arr, topSet })
  }
  sessions.sort((a, b) => (a.date < b.date ? 1 : -1)) // newest first
  return sessions
}

export function bestSet(sets: SetEntry[]): SetEntry | null {
  let best: SetEntry | null = null
  for (const s of sets) {
    if (s.weight == null) continue
    if (!best || s.weight > (best.weight ?? 0)) best = s
  }
  return best
}

// "Consistent" = training this lift densely enough that progression advice is meaningful.
export function isConsistent(sessions: SessionSummary[]): boolean {
  if (sessions.length < 3) return false
  const now = Date.now()
  const recent = sessions.filter((s) => now - Date.parse(s.date) <= 28 * DAY)
  if (recent.length < 3) return false
  return now - Date.parse(sessions[0].date) <= 14 * DAY
}

export interface Suggestion {
  text: string
  detail: string
}

// Only surfaces when training is consistent. Otherwise null → recall mode shows last + target instead.
export function suggestProgression(sessions: SessionSummary[], unit: string): Suggestion | null {
  if (!isConsistent(sessions)) return null
  const top = sessions[0].topSet
  if (!top || top.weight == null) return null
  const u = unit || 'kg'
  const w = top.weight
  const r = top.reps ?? 0
  const inc = 2.5
  if (r >= 8) {
    return {
      text: `Try ${w + inc}${u}`,
      detail: `Hit ${w}${u}×${r} last session — add ${inc}${u} and aim for 5+ reps`,
    }
  }
  if (r >= 5) {
    return { text: `Try ${w + inc}${u}`, detail: `${w}${u}×${r} last session — ready for +${inc}${u}` }
  }
  return { text: `Hold ${w}${u}`, detail: `Build reps at ${w}${u}×${r} before adding weight` }
}
