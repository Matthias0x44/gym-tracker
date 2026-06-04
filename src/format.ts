import type { Exercise, SetEntry } from './db'

export function relTime(ts: number): string {
  const d = Math.floor((Date.now() - ts) / 86400000)
  if (d <= 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 7) return `${d}d ago`
  if (d < 30) return `${Math.floor(d / 7)}w ago`
  if (d < 365) return `${Math.floor(d / 30)}mo ago`
  return `${Math.floor(d / 365)}y ago`
}

export function fmtSet(s: SetEntry, ex?: Exercise): string {
  if (s.weight != null) {
    const u = ex?.unit || 'kg'
    return s.reps != null ? `${s.weight}${u} × ${s.reps}` : `${s.weight}${u}`
  }
  return s.note || '—'
}
