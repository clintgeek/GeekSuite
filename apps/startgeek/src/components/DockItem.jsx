import { motion } from 'framer-motion'
import { useLinkTarget } from '../hooks/useLinkTarget'

// A real link (long-press, middle-click, "copy link", announced as a link).
// New tab on the desktop; same tab on a phone or when installed (#4).
const DockItem = ({ icon, label, url }) => {
  const targetProps = useLinkTarget()

  return (
    <motion.a
      href={url}
      {...targetProps}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 500, damping: 26 }}
      className="snap-center shrink-0 group relative flex flex-col no-underline items-center gap-1 w-14 sm:w-[68px] px-0.5 sm:px-1 py-1.5 rounded-[10px] text-ink-3 hover:text-ink hover:bg-panel transition-colors"
    >
      <span className="w-10 h-10 flex items-center justify-center [&>svg]:w-[22px] [&>svg]:h-[22px]">
        {icon}
      </span>

      <span className="dock-label block font-mono tracking-normal sm:tracking-[0.06em] uppercase leading-tight truncate w-full text-center">
        {label}
      </span>
    </motion.a>
  )
}

export default DockItem
