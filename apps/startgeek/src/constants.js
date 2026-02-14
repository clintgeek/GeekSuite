// Timing intervals (in milliseconds)
export const INTERVALS = {
  CLOCK_UPDATE: 1000,           // 1 second
  WEATHER_REFRESH: 15 * 60 * 1000,  // 15 minutes
  BACKGROUND_TIMEOUT: 8000      // 8 seconds
}

// Animation durations (in seconds for framer-motion)
export const ANIMATION = {
  FAST: 0.3,
  MEDIUM: 0.5,
  SLOW: 0.8,
  EASE: [0.22, 1, 0.36, 1]
}

// Forecast display settings
export const FORECAST = {
  LOCAL_DAYS: 7,
  WORLD_DAYS: 5
}
