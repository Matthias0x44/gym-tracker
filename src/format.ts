export function relTime(ts: number): string {
  const d = Math.floor((Date.now() - ts) / 86400000)
  if (d <= 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 7) return `${d}d ago`
  if (d < 30) return `${Math.floor(d / 7)}w ago`
  if (d < 365) return `${Math.floor(d / 30)}mo ago`
  return `${Math.floor(d / 365)}y ago`
}

export function fmtWeight(kg: number, unit = 'kg'): string {
  const n = Number.isInteger(kg) ? String(kg) : kg.toFixed(1)
  return `${n}${unit}`
}
