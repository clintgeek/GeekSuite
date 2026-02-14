// Weather locations configuration
const LOCATIONS = {
  buenosAires: {
    lat: -34.6037,
    lon: -58.3816,
    name: 'Buenos Aires',
    timezone: 'America/Argentina/Buenos_Aires',
    country: 'Argentina'
  },
  bengaluru: {
    lat: 12.9716,
    lon: 77.5946,
    name: 'Bengaluru',
    timezone: 'Asia/Kolkata',
    country: 'India'
  }
}

// Network timeout in milliseconds
const FETCH_TIMEOUT = 10000

class WeatherService {
  constructor() {
    this.baseUrl = 'https://api.open-meteo.com/v1'
    this.ipApiUrl = 'https://ipapi.co/json'
    this.cache = new Map()
    this.cacheTimeout = 10 * 60 * 1000 // 10 minutes
  }

  // Fetch with timeout support
  async fetchWithTimeout(url, timeout = FETCH_TIMEOUT) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(url, { signal: controller.signal })
      clearTimeout(timeoutId)
      return response
    } catch (error) {
      clearTimeout(timeoutId)
      if (error.name === 'AbortError') {
        throw new Error('Request timed out')
      }
      throw error
    }
  }

  getCacheKey(lat, lon, type) {
    return `${lat.toFixed(2)}_${lon.toFixed(2)}_${type}`
  }

  getCached(key) {
    const cached = this.cache.get(key)
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data
    }
    return null
  }

  setCache(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() })
  }

  async getCurrentLocation() {
    try {
      const response = await this.fetchWithTimeout(this.ipApiUrl)
      if (!response.ok) {
        throw new Error(`Location API error: ${response.status}`)
      }
      const data = await response.json()

      return {
        lat: data.latitude,
        lon: data.longitude,
        city: data.city,
        region: data.region,
        country: data.country_name,
        timezone: data.timezone
      }
    } catch (error) {
      console.error('Failed to get location:', error)
      // Fallback to a default location
      return {
        lat: 34.1201,
        lon: -93.0532,
        city: 'Arkadelphia',
        region: 'Arkansas',
        country: 'United States',
        timezone: 'America/Chicago'
      }
    }
  }

  async getWeatherByCoords(lat, lon, locationName = 'Unknown Location') {
    const cacheKey = this.getCacheKey(lat, lon, 'current')
    const cached = this.getCached(cacheKey)
    if (cached) return cached

    try {
      const url = `${this.baseUrl}/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m&hourly=precipitation_probability&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&forecast_days=1`

      const response = await this.fetchWithTimeout(url)
      if (!response.ok) throw new Error(`Weather API error: ${response.status}`)

      const data = await response.json()
      const current = data.current
      const currentHour = new Date().getHours()
      const precipitationProbability = data.hourly?.precipitation_probability?.[currentHour] || 0

      const result = {
        temperature: Math.round(current.temperature_2m),
        condition: this.getConditionFromCode(current.weather_code),
        description: this.getDescriptionFromCode(current.weather_code),
        location: locationName,
        humidity: current.relative_humidity_2m,
        windSpeed: Math.round(current.wind_speed_10m),
        windDirection: current.wind_direction_10m,
        icon: this.getIconFromCode(current.weather_code),
        pressure: current.surface_pressure,
        feelsLike: Math.round(current.apparent_temperature),
        precipitation: current.precipitation || 0,
        precipitationProbability,
        lat,
        lon,
        timestamp: current.time
      }

      this.setCache(cacheKey, result)
      return result
    } catch (error) {
      console.error('Failed to fetch weather:', error)
      throw error
    }
  }

  async get7DayForecast(lat, lon, locationName = 'Unknown Location') {
    const cacheKey = this.getCacheKey(lat, lon, 'forecast')
    const cached = this.getCached(cacheKey)
    if (cached) return cached

    try {
      const url = `${this.baseUrl}/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,precipitation_probability_max&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto`

      const response = await this.fetchWithTimeout(url)
      if (!response.ok) throw new Error(`Weather API error: ${response.status}`)

      const data = await response.json()
      const daily = data.daily

      const result = daily.time.map((date, index) => ({
        date,
        dayName: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
        fullDate: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        highTemp: Math.round(daily.temperature_2m_max[index]),
        lowTemp: Math.round(daily.temperature_2m_min[index]),
        condition: this.getConditionFromCode(daily.weather_code[index]),
        description: this.getDescriptionFromCode(daily.weather_code[index]),
        icon: this.getIconFromCode(daily.weather_code[index]),
        precipitation: daily.precipitation_sum[index] || 0,
        precipProbability: daily.precipitation_probability_max?.[index] || 0,
        windSpeed: Math.round(daily.wind_speed_10m_max[index]),
        location: locationName
      }))

      this.setCache(cacheKey, result)
      return result
    } catch (error) {
      console.error('Failed to fetch 7-day forecast:', error)
      throw error
    }
  }

  async getLocalWeatherWithForecast() {
    try {
      const location = await this.getCurrentLocation()
      const locationName = `${location.city}, ${location.region}`

      const [current, forecast] = await Promise.all([
        this.getWeatherByCoords(location.lat, location.lon, locationName),
        this.get7DayForecast(location.lat, location.lon, locationName)
      ])

      return {
        success: true,
        current,
        forecast,
        location
      }
    } catch (error) {
      console.error('Weather with forecast error:', error)
      return this.getFallbackWeather()
    }
  }

  async getLocationWeather(locationKey) {
    const loc = LOCATIONS[locationKey]
    if (!loc) throw new Error(`Unknown location: ${locationKey}`)

    try {
      return await this.getWeatherByCoords(loc.lat, loc.lon, loc.name)
    } catch (error) {
      console.error(`Failed to fetch weather for ${loc.name}:`, error)
      return {
        temperature: '--',
        condition: 'Unknown',
        humidity: '--',
        icon: 'partly-cloudy',
        location: loc.name
      }
    }
  }

  async getLocationWeatherWithForecast(locationKey) {
    const loc = LOCATIONS[locationKey]
    if (!loc) throw new Error(`Unknown location: ${locationKey}`)

    try {
      const [current, forecast] = await Promise.all([
        this.getWeatherByCoords(loc.lat, loc.lon, loc.name),
        this.get7DayForecast(loc.lat, loc.lon, loc.name)
      ])

      return { current, forecast, location: loc }
    } catch (error) {
      console.error(`Failed to fetch weather for ${loc.name}:`, error)
      return {
        current: {
          temperature: '--',
          condition: 'Unknown',
          icon: 'partly-cloudy',
          location: loc.name
        },
        forecast: [],
        location: loc
      }
    }
  }

  getFallbackWeather() {
    const fallbackForecast = Array.from({ length: 7 }, (_, i) => {
      const date = new Date()
      date.setDate(date.getDate() + i)
      return {
        date: date.toISOString().split('T')[0],
        dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
        fullDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        highTemp: 75,
        lowTemp: 60,
        condition: 'Clear',
        description: 'clear sky',
        icon: 'sunny',
        precipitation: 0,
        precipProbability: 0,
        windSpeed: 8,
        location: 'Unknown Location'
      }
    })

    return {
      success: false,
      current: {
        temperature: '--',
        condition: 'Unknown',
        description: 'Weather unavailable',
        location: 'Unknown Location',
        humidity: '--',
        windSpeed: '--',
        icon: 'partly-cloudy',
        feelsLike: '--',
        precipitationProbability: 0
      },
      forecast: fallbackForecast
    }
  }

  // Weather code mappings
  getConditionFromCode(code) {
    const codeMap = {
      0: 'Clear', 1: 'Mainly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
      45: 'Fog', 48: 'Rime Fog',
      51: 'Light Drizzle', 53: 'Drizzle', 55: 'Heavy Drizzle',
      56: 'Freezing Drizzle', 57: 'Freezing Drizzle',
      61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain',
      66: 'Freezing Rain', 67: 'Freezing Rain',
      71: 'Light Snow', 73: 'Snow', 75: 'Heavy Snow', 77: 'Snow Grains',
      80: 'Rain Showers', 81: 'Rain Showers', 82: 'Heavy Showers',
      85: 'Snow Showers', 86: 'Heavy Snow Showers',
      95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Severe Thunderstorm'
    }
    return codeMap[code] || 'Unknown'
  }

  getDescriptionFromCode(code) {
    const descriptions = {
      0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
      45: 'fog', 48: 'depositing rime fog',
      51: 'light drizzle', 53: 'moderate drizzle', 55: 'dense drizzle',
      56: 'light freezing drizzle', 57: 'dense freezing drizzle',
      61: 'slight rain', 63: 'moderate rain', 65: 'heavy rain',
      66: 'light freezing rain', 67: 'heavy freezing rain',
      71: 'slight snow', 73: 'moderate snow', 75: 'heavy snow', 77: 'snow grains',
      80: 'slight rain showers', 81: 'moderate rain showers', 82: 'violent rain showers',
      85: 'slight snow showers', 86: 'heavy snow showers',
      95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'severe thunderstorm'
    }
    return descriptions[code] || 'unknown'
  }

  getIconFromCode(code) {
    if (code === 0) return 'sunny'
    if (code === 1) return 'mostly-sunny'
    if (code === 2) return 'partly-cloudy'
    if (code === 3) return 'cloudy'
    if ([45, 48].includes(code)) return 'foggy'
    if ([51, 53, 55, 56, 57].includes(code)) return 'drizzle'
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rainy'
    if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snowy'
    if ([95, 96, 99].includes(code)) return 'stormy'
    return 'partly-cloudy'
  }

  getWeatherEmoji(iconCode) {
    const iconMap = {
      'sunny': '☀️',
      'mostly-sunny': '🌤️',
      'partly-cloudy': '⛅',
      'cloudy': '☁️',
      'foggy': '🌫️',
      'drizzle': '🌦️',
      'rainy': '🌧️',
      'snowy': '🌨️',
      'stormy': '⛈️'
    }
    return iconMap[iconCode] || '⛅'
  }
}

export const weatherService = new WeatherService()
export { LOCATIONS }
