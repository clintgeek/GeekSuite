import { useContext } from 'react'
import { GlanceContext } from '../context/glanceContextValue'

export const useGlance = () => {
  const context = useContext(GlanceContext)
  if (!context) {
    throw new Error('useGlance must be used within a GlanceProvider')
  }
  return context
}
