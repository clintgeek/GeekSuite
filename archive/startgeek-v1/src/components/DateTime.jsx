import { motion } from 'framer-motion'
import { useTime } from '../hooks/useTime'
import { ANIMATION } from '../constants'

const DateTime = () => {
  const time = useTime()

  const hours = time.getHours()
  const minutes = time.getMinutes().toString().padStart(2, '0')
  const period = hours >= 12 ? 'pm' : 'am'
  const displayHours = hours % 12 || 12

  const weekday = time.toLocaleDateString('en-US', { weekday: 'long' })
  const month = time.toLocaleDateString('en-US', { month: 'long' })
  const day = time.getDate()
  const year = time.getFullYear()

  const getOrdinal = (n) => {
    const s = ['th', 'st', 'nd', 'rd']
    const v = n % 100
    return n + (s[(v - 20) % 10] || s[v] || s[0])
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ANIMATION.SLOW, ease: ANIMATION.EASE }}
      className="text-center select-none"
    >
      <h1
        className="text-[5rem] md:text-[7rem] lg:text-[9rem] font-bold leading-none tracking-tight text-white"
        style={{ textShadow: '0 2px 20px rgba(0,0,0,0.3), 0 1px 4px rgba(0,0,0,0.2)' }}
      >
        {displayHours}:{minutes} {period}
      </h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.6 }}
        className="mt-1 text-lg md:text-xl lg:text-2xl font-medium text-white/60 tracking-widest"
        style={{ textShadow: '0 1px 4px rgba(0,0,0,0.25)' }}
      >
        {weekday} <span className="text-white/30 mx-2">·</span> {month} {getOrdinal(day)}, {year}
      </motion.p>
    </motion.div>
  )
}

export default DateTime
