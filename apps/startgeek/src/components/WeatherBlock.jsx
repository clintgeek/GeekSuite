import { motion } from 'framer-motion'
import { useWeather } from '../hooks/useWeather'
import { ANIMATION, REDUCED_MOTION } from '../constants'

const Stat = ({ k, v }) => (
  <div className="flex flex-col gap-0.5 min-w-0">
    <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-ink-3">{k}</span>
    <span className="text-[13px] text-ink tnum truncate">{v}</span>
  </div>
)

// Today's weather as one panel beside the clock. The whole block is a
// button; clicking opens the detail modal with the week.
const WeatherBlock = ({ onOpen }) => {
  const { local, loading } = useWeather()
  const { current: w, forecast, error } = local
  const today = forecast?.[0]

  const shell =
    'mod h-full w-full text-left flex flex-col justify-between gap-4 p-5 cursor-pointer'

  if (loading) {
    return (
      <div className={shell} aria-hidden="true">
        <div className="h-3 w-24 bg-white/10 rounded animate-pulse" />
        <div className="h-10 w-32 bg-white/10 rounded animate-pulse" />
        <div className="h-3 w-40 bg-white/10 rounded animate-pulse" />
      </div>
    )
  }

  if (error || !w) {
    return (
      <div className={shell}>
        <span className="label">Weather</span>
        <span className="text-sm text-ink-3">Weather unavailable</span>
      </div>
    )
  }

  const city = w.location?.split(',')[0] || 'Local'
  const hasRange = today && Number.isFinite(today.highTemp) && Number.isFinite(today.lowTemp)

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={REDUCED_MOTION ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ANIMATION.MEDIUM, ease: ANIMATION.EASE, delay: 0.1 }}
      className={shell}
      aria-label={`Weather in ${city}: ${w.temperature} degrees, ${w.description}. Open details`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="label block">{city}</span>
          <span className="block text-[13px] text-ink-2 mt-1 truncate">{w.description}</span>
        </div>
        <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-ink-3 shrink-0 pt-0.5">
          Details
        </span>
      </div>

      <div className="flex items-baseline gap-3">
        <span
          className="font-extralight leading-none tracking-[-0.03em] tnum text-ink"
          style={{ fontSize: 'clamp(48px, 5.5vw, 72px)' }}
        >
          {w.temperature}°
        </span>
        {Number.isFinite(w.feelsLike) && w.feelsLike !== w.temperature && (
          <span className="font-mono text-[11px] tracking-wide text-ink-3 tnum">
            feels {w.feelsLike}°
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat k="Hi / Lo" v={hasRange ? `${today.highTemp}° / ${today.lowTemp}°` : '--'} />
        <Stat k="Humidity" v={Number.isFinite(w.humidity) ? `${w.humidity}%` : '--'} />
        <Stat k="Wind" v={Number.isFinite(w.windSpeed) ? `${w.windSpeed} mph` : '--'} />
      </div>
    </motion.button>
  )
}

export default WeatherBlock
