// time.js — one clock format for the whole console, following the 12/24 h
// setting (design review 2026-11-18, #9: sunrise and sunset were always
// 24 h while the clock said "9:38 AM").

/** 2pm, 2:30pm, or 14:00 / 14:30 on a 24-hour clock. */
export function formatTime(date, hour12 = true) {
  const h = date.getHours()
  const m = date.getMinutes()
  const mm = String(m).padStart(2, '0')
  if (!hour12) return `${String(h).padStart(2, '0')}:${mm}`
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${m ? `:${mm}` : ''}${h < 12 ? 'am' : 'pm'}`
}

/** formatTime for an ISO string; null when there is no usable time. */
export function formatIsoTime(iso, hour12 = true) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return formatTime(d, hour12)
}
