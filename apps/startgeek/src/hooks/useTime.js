import { useState, useEffect } from 'react'
import { INTERVALS } from '../constants'

// Shared time hook - pauses when tab is hidden to save resources
export const useTime = () => {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    let timer = null

    const startTimer = () => {
      if (timer) return
      timer = setInterval(() => setTime(new Date()), INTERVALS.CLOCK_UPDATE)
    }

    const stopTimer = () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopTimer()
      } else {
        setTime(new Date()) // Update immediately when tab becomes visible
        startTimer()
      }
    }

    // Start timer and listen for visibility changes
    startTimer()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      stopTimer()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return time
}
