import { motion } from 'framer-motion'
import DockItem from './DockItem'
import { PRIMARY_APPS } from '../config/apps'
import { ANIMATION } from '../constants'

const AppDock = () => {
  return (
    <motion.nav
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ANIMATION.MEDIUM, delay: 0.5, ease: ANIMATION.EASE }}
      className="dock-safe-bottom fixed inset-x-0 z-30 flex justify-center px-3 pointer-events-none"
      aria-label="Apps"
    >
      {/* Scrolls with snap instead of squeezing icons when the row can't
          fit at the viewport width (e.g. six-plus apps at 390px). */}
      <div className="glass flex items-end gap-0.5 px-2.5 py-2 rounded-2xl pointer-events-auto max-w-full overflow-x-auto snap-x snap-mandatory">
        {PRIMARY_APPS.map((app) => (
          <DockItem key={app.id} icon={app.icon} label={app.label} url={app.url} />
        ))}
      </div>
    </motion.nav>
  )
}

export default AppDock
