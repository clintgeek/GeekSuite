import { motion } from 'framer-motion'
import { useTime } from '../hooks/useTime'
import { useSettings } from '../hooks/useSettings'
import { ANIMATION } from '../constants'

const DateTime = () => {
  const time = useTime()
  const { settings } = useSettings()

  const hours = time.getHours()
  const minutes = time.getMinutes().toString().padStart(2, '0')
  const twelve = settings.clock === '12'
  const period = hours >= 12 ? 'pm' : 'am'
  const displayHours = twelve ? hours % 12 || 12 : String(hours).padStart(2, '0')

  const weekday = time.toLocaleDateString('en-US', { weekday: 'long' })
  const rest = time.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ANIMATION.SLOW, ease: ANIMATION.EASE }}
      className="select-none flex flex-col gap-1.5"
    >
      <h1
        className="flex items-baseline gap-3.5 font-extralight leading-[0.92] tracking-[-0.035em] tnum text-ink"
        style={{
          fontSize: 'clamp(72px, 11vw, 148px)',
          textShadow: '0 2px 30px rgba(0,0,0,0.35)',
        }}
      >
        <span>
          {displayHours}:{minutes}
        </span>
        {twelve && (
          <span className="font-mono text-sm font-normal tracking-[0.14em] uppercase text-ink-2 -translate-y-[0.5em]">
            {period}
          </span>
        )}
      </h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.6 }}
        className="text-[17px] text-ink-2"
      >
        <span className="font-medium text-ink">{weekday}</span>
        <span className="mx-2 text-ink-3">·</span>
        {rest}
      </motion.p>
    </motion.div>
  )
}

export default DateTime
