import { motion } from 'framer-motion'
import { useWeather } from '../hooks/useWeather'
import { ANIMATION } from '../constants'

const Sep = () => <span className="w-px h-3.5 bg-hair-strong" aria-hidden="true" />

// Ambient conditions in the top rail: city, temperature, description, then
// today's range, humidity and wind in mono. Everything here was already
// fetched; it just wasn't shown.
const WeatherStrip = () => {
  const { local, loading } = useWeather()
  const { current: weather, forecast, error } = local
  const today = forecast?.[0]

  if (loading) {
    return <div className="h-4 w-40 bg-white/10 rounded-full animate-pulse" />
  }

  if (error || !weather) {
    return <span className="text-sm text-ink-3">Weather unavailable</span>
  }

  const cityName = weather.location?.split(',')[0] || 'Local'
  const hasRange = today && Number.isFinite(today.highTemp) && Number.isFinite(today.lowTemp)
  const hasAir = Number.isFinite(weather.humidity) && Number.isFinite(weather.windSpeed)

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ANIMATION.MEDIUM }}
      className="flex items-center gap-3.5 text-[13px] text-ink-2 min-w-0"
    >
      <span className="font-medium text-ink truncate">{cityName}</span>
      <span className="font-medium text-ink tnum">{weather.temperature}°</span>
      <span className="truncate">{weather.description}</span>
      {hasRange && (
        <>
          <Sep />
          <span className="font-mono text-[11px] tracking-wide text-ink-3 tnum">
            H {today.highTemp} · L {today.lowTemp}
          </span>
        </>
      )}
      {hasAir && (
        <>
          <Sep />
          <span className="hidden md:inline font-mono text-[11px] tracking-wide text-ink-3 tnum">
            {weather.humidity}% RH · W {weather.windSpeed} mph
          </span>
        </>
      )}
    </motion.div>
  )
}

export default WeatherStrip
