import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ANIMATION } from '../constants'
import { pausesOnPointer, toastLifetime } from '../lib/feedback'

/**
 * One message at a time, at the bottom above the dock.
 *
 * - The live region is always in the page (a region that appears with its
 *   text is often not read), so screen readers hear every message.
 * - A message stays about 6 s, 8 s with an Undo, and a failure stays until it
 *   is dismissed (lib/feedback.js). Hover or focus pauses the clock.
 * - Close (×) is always there; Esc does not close it, because Esc already
 *   belongs to the command box.
 */
const Toast = ({ toast, onClose }) => {
  const onCloseRef = useRef(onClose)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const ms = toastLifetime(toast)
    if (!toast || ms == null || paused) return
    const timer = setTimeout(() => onCloseRef.current(), ms)
    return () => clearTimeout(timer)
  }, [toast, paused])

  // A new message starts its own clock.
  useEffect(() => {
    setPaused(false)
  }, [toast])

  const isError = toast?.tone === 'error'

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="toast-safe-bottom fixed inset-x-0 z-50 flex justify-center px-4 pointer-events-none">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.message}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: ANIMATION.FAST, ease: ANIMATION.EASE }}
            className={`pointer-events-auto flex items-center gap-1 max-w-[560px] min-h-[44px] pl-4 pr-1 rounded-2xl border text-sm text-ink ${
              isError ? 'border-[rgba(240,113,120,0.55)]' : 'border-hair-strong'
            }`}
            style={{
              background: 'rgba(12, 15, 21, 0.92)',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
              boxShadow: '0 10px 40px rgba(0,0,0,0.45)',
            }}
            onPointerEnter={(e) => {
              if (pausesOnPointer(e.pointerType)) setPaused(true)
            }}
            onPointerLeave={(e) => {
              if (pausesOnPointer(e.pointerType)) setPaused(false)
            }}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
          >
            {isError && <span className="sr-only">Problem: </span>}
            <span className={`py-2.5 leading-snug ${isError ? 'text-[#f6b3b7]' : ''}`}>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  const run = toast.action.run
                  onCloseRef.current()
                  run()
                }}
                className="shrink-0 min-h-[44px] px-3 rounded-lg font-mono text-[12px] tracking-[0.08em] uppercase text-accent hover:bg-panel-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgba(127,180,230,0.65)]"
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => onCloseRef.current()}
              aria-label="Dismiss message"
              className="shrink-0 w-11 h-11 grid place-items-center rounded-lg text-ink-2 hover:text-ink hover:bg-panel-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-[rgba(127,180,230,0.65)]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default Toast
