import { motion } from 'framer-motion'
import DockItem from './DockItem'
import { PRIMARY_APPS } from '../config/apps'
import { ANIMATION } from '../constants'

const AppDock = () => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ANIMATION.MEDIUM, delay: 0.6, ease: ANIMATION.EASE }}
      className="fixed bottom-5 inset-x-0 z-30 flex justify-center pointer-events-none"
    >
      <div
        className="flex items-end gap-1 px-4 py-2.5 rounded-[20px] pointer-events-auto border border-white/[0.12]"
        style={{
          backdropFilter: 'saturate(1.4) blur(24px)',
          WebkitBackdropFilter: 'saturate(1.4) blur(24px)',
          background: 'linear-gradient(to bottom, rgba(255,255,255,0.10), rgba(255,255,255,0.04))',
          boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.12), inset 0 -1px 0 0 rgba(0,0,0,0.08), 0 8px 40px rgba(0,0,0,0.35), 0 2px 12px rgba(0,0,0,0.2)',
        }}
      >
        {PRIMARY_APPS.map((app) => (
          <DockItem
            key={app.id}
            icon={app.icon}
            label={app.label}
            url={app.url}
          />
        ))}
      </div>
    </motion.div>
  )
}

export default AppDock
