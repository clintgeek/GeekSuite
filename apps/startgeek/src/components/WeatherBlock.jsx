import { motion } from 'framer-motion'
import { useWeather } from '../hooks/useWeather'
import { ANIMATION, REDUCED_MOTION } from '../constants'

const SHADOW = { textShadow: '0 2px 30px rgba(0,0,0,0.35)' }
const SHADOW_SM = { textShadow: '0 1px 4px rgba(0,0,0,0.25)' }

// Today's weather set in the clock's type: a big thin temperature on the
// same baseline, city and conditions in the date's voice, a mono stat line.
// No panel, so the hero stays balanced. The whole block opens the modal.
const WeatherBlock = ({ onOpen }) => {
  const { local, loading } = useWeather()
  const { current: w, forecast, error } = local
  const today = forecast?.[0]

  if (loading) {
    return (
      <div className="flex flex-col items-end justify-end gap-3 select-none" aria-hidden="true">
        <div className="h-16 w-40 bg-white/10 rounded animate-pulse" />
        <div className="h-3 w-48 bg-white/10 rounded animate-pulse" />
        <div className="h-3 w-56 bg-white/10 rounded animate-pulse" />
      </div>
    )
  }

  if (error || !w) {
    return (
      <div className="flex flex-col items-end justify-end text-right">
        <span className="text-[17px] text-ink-3">Weather unavailable</span>
      </div>
    )
  }

  const city = w.location?.split(',')[0] || 'Local'
  const hasRange = today && Number.isFinite(today.highTemp) && Number.isFinite(today.lowTemp)
  const stats = [
    hasRange ? `H ${today.highTemp} · L ${today.lowTemp}` : null,
    Number.isFinite(w.humidity) ? `${w.humidity}% RH` : null,
    Number.isFinite(w.windSpeed) ? `W ${w.windSpeed} mph` : null,
  ].filter(Boolean)

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={REDUCED_MOTION ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ANIMATION.SLOW, ease: ANIMATION.EASE, delay: 0.1 }}
      className="hero-weather group flex flex-col items-end justify-end gap-1.5 text-right select-none rounded-lg -mr-2 pr-2"
      aria-label={`Weather in ${city}: ${w.temperature} degrees, ${w.description}. Open details`}
    >
      <span
        className="hero-weather-num flex items-baseline gap-3.5 font-extralight leading-[0.92] tracking-[-0.035em] tnum text-ink"
        style={SHADOW}
      >
        {w.temperature}°
      </span>

      <span className="text-[17px] text-ink-2" style={SHADOW_SM}>
        <span className="font-medium text-ink">{city}</span>
        <span className="mx-2 text-ink-3">·</span>
        {w.description}
      </span>

      {stats.length > 0 && (
        <span className="font-mono text-[12px] tracking-[0.06em] uppercase text-ink-2 tnum" style={SHADOW_SM}>
          {stats.join('   ')}
          <span className="weather-details-link ml-3 text-ink-3 group-hover:text-accent transition-colors">Details</span>
        </span>
      )}
    </motion.button>
  )
}

export default WeatherBlock
