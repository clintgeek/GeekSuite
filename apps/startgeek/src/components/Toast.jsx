import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ANIMATION } from '../constants'

const Toast = ({ message, onClose }) => {
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => onCloseRef.current(), 2500)
    return () => clearTimeout(timer)
  }, [message])

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: ANIMATION.FAST, ease: ANIMATION.EASE }}
          className="toast-safe-bottom fixed left-1/2 -translate-x-1/2 z-40"
        >
          <div
            className="px-4 py-2 rounded-full text-sm font-medium text-white/90"
            style={{
              background: 'rgba(0, 0, 0, 0.45)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
          >
            {message}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default Toast
