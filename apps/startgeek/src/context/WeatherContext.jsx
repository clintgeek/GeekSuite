import { useState, useEffect } from 'react'
import { WeatherContext } from './weatherContextValue'
import { weatherService } from '../services/weatherService'
import { INTERVALS } from '../constants'

export const WeatherProvider = ({ children }) => {
  const [localWeather, setLocalWeather] = useState({ current: null, forecast: [], error: null })
  const [buenosAiresWeather, setBuenosAiresWeather] = useState({ current: null, forecast: [], error: null })
  const [bengaluruWeather, setBengaluruWeather] = useState({ current: null, forecast: [], error: null })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchAllWeather = async () => {
      try {
        const [local, ba, blr] = await Promise.all([
          weatherService.getLocalWeatherWithForecast(),
          weatherService.getLocationWeatherWithForecast('buenosAires'),
          weatherService.getLocationWeatherWithForecast('bengaluru')
        ])

        setLocalWeather({ current: local.current, forecast: local.forecast || [], error: null })
        setBuenosAiresWeather({ current: ba.current, forecast: ba.forecast || [], error: null })
        setBengaluruWeather({ current: blr.current, forecast: blr.forecast || [], error: null })
      } catch (error) {
        console.error('Weather fetch failed:', error)
        setLocalWeather(prev => ({ ...prev, error: 'Failed to load weather' }))
      } finally {
        setLoading(false)
      }
    }

    fetchAllWeather()
    const interval = setInterval(fetchAllWeather, INTERVALS.WEATHER_REFRESH)
    return () => clearInterval(interval)
  }, [])

  return (
    <WeatherContext.Provider value={{
      local: localWeather,
      buenosAires: buenosAiresWeather,
      bengaluru: bengaluruWeather,
      loading
    }}>
      {children}
    </WeatherContext.Provider>
  )
}
