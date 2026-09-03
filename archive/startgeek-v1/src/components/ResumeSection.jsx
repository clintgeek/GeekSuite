import { motion } from 'framer-motion'
import { ANIMATION } from '../constants'

// Mock data — will be replaced with real GeekSuite API calls
const RESUME_ITEMS = [
  {
    id: 'notegeek-recent',
    app: 'NoteGeek',
    label: 'Project Architecture Notes',
    detail: 'Edited 2 hours ago',
  },
  {
    id: 'bujogeek-today',
    app: 'BujoGeek',
    label: 'Morning routine',
    detail: 'Last opened today, 7:14 am',
  },
  {
    id: 'fitnessgeek-log',
    app: 'FitnessGeek',
    label: 'Thursday workout log',
    detail: 'Updated yesterday',
  },
]

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.4,
    },
  },
}

const item = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: ANIMATION.MEDIUM, ease: ANIMATION.EASE } },
}

const ResumeSection = () => {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="w-full max-w-md mx-auto mt-8 md:mt-10"
    >
      <div className="flex flex-col gap-1.5">
        {RESUME_ITEMS.map((entry) => (
          <motion.button
            key={entry.id}
            variants={item}
            whileHover={{ x: 3 }}
            whileTap={{ scale: 0.99 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.06] transition-colors text-left group focus:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
          >
            {/* Minimal dot indicator */}
            <div className="w-1.5 h-1.5 rounded-full bg-white/25 group-hover:bg-white/50 transition-colors flex-shrink-0" />

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-white/70 group-hover:text-white/90 truncate leading-snug transition-colors">
                {entry.label}
              </p>
            </div>

            {/* App + time */}
            <span className="text-[11px] text-white/25 group-hover:text-white/40 transition-colors flex-shrink-0">
              {entry.app}
            </span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  )
}

export default ResumeSection
