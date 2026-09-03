import { useTime } from '../hooks/useTime'
import { useWeather } from '../hooks/useWeather'

// Minutes since local midnight for an Open-Meteo local ISO string
// ("2026-09-03T06:52"). Returns null when the value is unusable.
const minutesOf = (iso) => {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.getHours() * 60 + d.getMinutes()
}

const pct = (minutes) => `${((minutes / 1440) * 100).toFixed(2)}%`

const hhmm = (minutes) => {
  const h = Math.floor(minutes / 60)
  const m = String(minutes % 60).padStart(2, '0')
  return `${h}:${m}`
}

// A 24-hour hairline with daylight, sunrise, sunset, and a live marker.
const DayTrack = () => {
  const time = useTime()
  const { local } = useWeather()
  const today = local.forecast?.[0]

  const rise = minutesOf(today?.sunrise)
  const set = minutesOf(today?.sunset)
  const now = time.getHours() * 60 + time.getMinutes()
  const hasSun = rise != null && set != null && set > rise

  return (
    <div className="track" aria-label="Day progress">
      <div className="track-line" />
      {hasSun && (
        <>
          <div className="track-light" style={{ left: pct(rise), width: pct(set - rise) }} />
          <span className="track-sun" style={{ left: pct(rise) }}>{hhmm(rise)}</span>
          <span className="track-sun" style={{ left: pct(set) }}>{hhmm(set)}</span>
        </>
      )}
      {[0, 6, 12, 18, 24].map((h) => (
        <span key={h}>
          <i className="track-tick" style={{ left: pct(h * 60) }} />
          <span className="track-lbl" style={{ left: pct(h * 60) }}>
            {String(h).padStart(2, '0')}
          </span>
        </span>
      ))}
      <i className="track-now" style={{ left: pct(now) }} />
    </div>
  )
}

export default DayTrack
