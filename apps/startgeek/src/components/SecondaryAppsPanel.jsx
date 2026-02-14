import { motion, AnimatePresence } from 'framer-motion'
import DockItem from './DockItem'
import { SECONDARY_APPS } from '../config/apps'

const SecondaryAppsPanel = ({ isOpen, onClose }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-5 py-4 rounded-[20px] border border-white/[0.12]"
            style={{
              backdropFilter: 'saturate(1.4) blur(24px)',
              WebkitBackdropFilter: 'saturate(1.4) blur(24px)',
              background: 'linear-gradient(to bottom, rgba(255,255,255,0.10), rgba(255,255,255,0.04))',
              boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.12), inset 0 -1px 0 0 rgba(0,0,0,0.08), 0 8px 40px rgba(0,0,0,0.35), 0 2px 12px rgba(0,0,0,0.2)',
            }}
          >
            <p className="text-xs font-medium uppercase tracking-widest text-white/30 mb-4 text-center">
              All Apps
            </p>

            <div className="flex items-center gap-0.5 md:gap-1">
              {SECONDARY_APPS.map((app) => (
                <DockItem
                  key={app.id}
                  icon={app.icon}
                  label={app.label}
                  url={app.url}
                />
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export default SecondaryAppsPanel
