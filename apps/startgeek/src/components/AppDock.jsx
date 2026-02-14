import { useState } from 'react'
import { motion } from 'framer-motion'
import DockItem from './DockItem'
import SecondaryAppsPanel from './SecondaryAppsPanel'
import { PRIMARY_APPS, MORE_BUTTON } from '../config/apps'
import { ANIMATION } from '../constants'

const AppDock = () => {
  const [showSecondary, setShowSecondary] = useState(false)

  return (
    <>
      <SecondaryAppsPanel
        isOpen={showSecondary}
        onClose={() => setShowSecondary(false)}
      />

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
          {/* Primary apps */}
          {PRIMARY_APPS.map((app) => (
            <DockItem
              key={app.id}
              icon={app.icon}
              label={app.label}
              url={app.url}
            />
          ))}

          {/* Divider */}
          <div className="w-px h-9 bg-white/[0.10] mx-1.5 self-center" />

          {/* All Apps trigger */}
          <DockItem
            icon={MORE_BUTTON.icon}
            label={MORE_BUTTON.label}
            onClick={() => setShowSecondary(!showSecondary)}
          />
        </div>
      </motion.div>
    </>
  )
}

export default AppDock
