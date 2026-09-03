import { motion } from 'framer-motion'

const DockItem = ({ icon, label, url, onClick, badge }) => {
  const handleClick = () => {
    if (onClick) return onClick()
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <motion.button
      onClick={handleClick}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 500, damping: 26 }}
      className="group relative flex flex-col items-center gap-1 w-14 sm:w-[68px] px-1 py-1.5 rounded-[10px] text-ink-3 hover:text-ink hover:bg-panel transition-colors"
    >
      <span className="w-10 h-10 flex items-center justify-center [&>svg]:w-[22px] [&>svg]:h-[22px]">
        {icon}
      </span>

      {badge && (
        <span className="absolute top-0.5 right-2 min-w-[16px] h-[16px] px-1 flex items-center justify-center rounded-full bg-accent text-[9px] font-mono font-medium text-ground leading-none">
          {badge}
        </span>
      )}

      <span className="hidden sm:block font-mono text-[10px] tracking-[0.06em] uppercase leading-tight truncate w-full text-center">
        {label}
      </span>
    </motion.button>
  )
}

export default DockItem
