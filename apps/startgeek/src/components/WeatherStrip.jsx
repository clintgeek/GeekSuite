import { motion } from 'framer-motion'
import { useWeather } from '../hooks/useWeather'
import { weatherService } from '../services/weatherService'
import { ANIMATION } from '../constants'

const WeatherStrip = () => {
  const { local, loading } = useWeather()
  const { current: weather, error } = local

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center justify-center gap-3"
      >
        <div className="h-5 w-32 bg-white/10 rounded-full animate-pulse" />
      </motion.div>
    )
  }

  if (error || !weather) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center justify-center"
      >
        <span className="text-sm text-white/40">Weather unavailable</span>
      </motion.div>
    )
  }

  const cityName = weather.location?.split(',')[0] || 'Local'

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ANIMATION.MEDIUM }}
      className="flex items-center justify-center gap-3"
      style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}
    >
      <span className="text-sm font-medium text-white/60 tracking-wide">{cityName}</span>
      <span className="text-lg">{weatherService.getWeatherEmoji(weather.icon)}</span>
      <span className="text-sm font-semibold text-white/80 tracking-wide">{weather.temperature}°F</span>
      <span className="text-sm font-medium text-white/50 tracking-wide">{weather.description}</span>
    </motion.div>
  )
}

export default WeatherStrip
