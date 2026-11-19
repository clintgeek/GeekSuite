import { motion } from 'framer-motion'
import { useWeather } from '../hooks/useWeather'
import { ANIMATION, REDUCED_MOTION } from '../constants'
import { sentenceCase, weatherStats, STAT_SEPARATOR } from '../lib/weatherText'

const SHADOW = { textShadow: '0 2px 30px rgba(0,0,0,0.35)' }

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
        <span className="on-photo text-[17px] text-ink-2">Weather unavailable</span>
      </div>
    )
  }

  const city = w.location?.split(',')[0] || 'Local'
  const stats = weatherStats({
    high: today?.highTemp,
    low: today?.lowTemp,
    humidity: w.humidity,
    windSpeed: w.windSpeed,
  })
  const description = sentenceCase(w.description)

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={REDUCED_MOTION ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ANIMATION.SLOW, ease: ANIMATION.EASE, delay: 0.1 }}
      className="hero-weather group flex flex-col items-end justify-end gap-1.5 text-right select-none rounded-lg -mr-2 pr-2"
      aria-label={`Weather in ${city}: ${w.temperature} degrees, ${description}. Open details`}
    >
      <span
        className="hero-weather-num flex items-baseline gap-3.5 font-extralight leading-[0.92] tracking-[-0.035em] tnum text-ink"
        style={SHADOW}
      >
        {w.temperature}°
      </span>

      <span className="on-photo text-[17px] text-ink-2">
        <span className="font-medium text-ink">{city}</span>
        <span className="mx-2 text-ink-2" aria-hidden="true">·</span>
        {description}
      </span>

      {stats.length > 0 && (
        <span className="on-photo font-mono text-[12px] tracking-[0.06em] uppercase text-ink-2 tnum">
          {stats.join(STAT_SEPARATOR)}
          <span className="weather-details-link ml-3 text-ink-2 group-hover:text-accent transition-colors">Details</span>
        </span>
      )}
    </motion.button>
  )
}

export default WeatherBlock
