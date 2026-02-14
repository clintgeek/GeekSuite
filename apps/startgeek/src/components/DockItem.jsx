import { motion } from 'framer-motion'

const DockItem = ({ icon, label, url, onClick, badge }) => {
  const handleClick = () => {
    if (onClick) return onClick()
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <motion.button
      onClick={handleClick}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 500, damping: 24 }}
      className="flex flex-col items-center gap-1 w-16 md:w-[72px] py-1.5 group relative focus:outline-none"
    >
      {/* Icon */}
      <div className="w-11 h-11 md:w-12 md:h-12 rounded-2xl flex items-center justify-center text-white/55 group-hover:text-white/85 transition-all duration-200">
        {icon}
      </div>

      {/* Badge */}
      {badge && (
        <span className="absolute top-0.5 right-2 min-w-[16px] h-[16px] px-1 flex items-center justify-center rounded-full bg-white/20 text-[9px] font-bold text-white leading-none">
          {badge}
        </span>
      )}

      {/* Label */}
      <span className="text-[10px] font-medium text-white/40 group-hover:text-white/70 transition-colors leading-tight truncate w-full text-center">
        {label}
      </span>
    </motion.button>
  )
}

export default DockItem
