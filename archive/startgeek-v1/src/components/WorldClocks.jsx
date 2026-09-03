import { motion } from 'framer-motion'
import { useWeather } from '../hooks/useWeather'
import { useTime } from '../hooks/useTime'
import { weatherService, LOCATIONS } from '../services/weatherService'
import { ANIMATION, FORECAST } from '../constants'

const ZoneItem = ({ city, timezone, weather, forecast, loading }) => {
  const time = useTime()

  const localTime = time.toLocaleTimeString('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).toLowerCase()

  if (loading) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-base font-medium text-white/70">{city}</span>
        <span className="text-lg font-bold text-white">{localTime}</span>
        <div className="h-6 w-20 bg-white/10 rounded animate-pulse" />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-base font-medium text-white/70">{city}</span>
      <span className="text-lg font-bold text-white">{localTime}</span>

      {weather && (
        <>
          <span className="text-xl">{weatherService.getWeatherEmoji(weather.icon)}</span>
          {weather.temperature !== '--' && (
            <span className="text-base text-white/80">{weather.temperature}°F</span>
          )}
        </>
      )}

      {forecast && forecast.slice(0, FORECAST.WORLD_DAYS).map((day) => (
        <div key={day.date} className="flex items-center gap-1">
          <span className="text-sm text-white/40">{day.dayName}</span>
          <span className="text-base">{weatherService.getWeatherEmoji(day.icon)}</span>
          <span className="text-sm text-white/70">{day.highTemp}°</span>
          <span className="text-sm text-white/40">{day.lowTemp}°</span>
        </div>
      ))}
    </div>
  )
}

const WorldClocks = () => {
  const { buenosAires, bengaluru, loading } = useWeather()

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: ANIMATION.MEDIUM, delay: ANIMATION.FAST }}
      className="flex items-center justify-between w-full"
    >
      <ZoneItem
        city="Buenos Aires"
        timezone={LOCATIONS.buenosAires.timezone}
        weather={buenosAires.current}
        forecast={buenosAires.forecast}
        loading={loading}
      />
      <ZoneItem
        city="Bengaluru"
        timezone={LOCATIONS.bengaluru.timezone}
        weather={bengaluru.current}
        forecast={bengaluru.forecast}
        loading={loading}
      />
    </motion.div>
  )
}

export default WorldClocks
