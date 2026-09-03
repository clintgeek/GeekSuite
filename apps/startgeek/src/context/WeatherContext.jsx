import { useState, useEffect } from 'react'
import { WeatherContext } from './weatherContextValue'
import { weatherService } from '../services/weatherService'
import { INTERVALS } from '../constants'

// Local conditions plus the 7-day forecast. The v1 world-clock cities
// (Buenos Aires, Bengaluru) were fetched here too but nothing rendered
// them, so they are gone.
export const WeatherProvider = ({ children }) => {
  const [localWeather, setLocalWeather] = useState({ current: null, forecast: [], error: null })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const local = await weatherService.getLocalWeatherWithForecast()
        setLocalWeather({ current: local.current, forecast: local.forecast || [], error: null })
      } catch (error) {
        console.error('Weather fetch failed:', error)
        setLocalWeather((prev) => ({ ...prev, error: 'Failed to load weather' }))
      } finally {
        setLoading(false)
      }
    }

    fetchWeather()
    const interval = setInterval(fetchWeather, INTERVALS.WEATHER_REFRESH)
    return () => clearInterval(interval)
  }, [])

  return (
    <WeatherContext.Provider value={{ local: localWeather, loading }}>
      {children}
    </WeatherContext.Provider>
  )
}
