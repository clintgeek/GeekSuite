import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSettings } from '../hooks/useSettings'
import { useSession } from '../hooks/useSession'
import { MODULES } from '../config/modules'
import { ANIMATION, REDUCED_MOTION } from '../constants'

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

const Group = ({ title, children }) => (
  <div className="border-t border-hair py-4">
    {title && (
      <h3 className="label !text-[10px] !text-ink-3 mb-2.5 font-normal">{title}</h3>
    )}
    {children}
  </div>
)

const Seg = ({ value, options, onChange, ariaLabel }) => (
  <div className="seg" role="group" aria-label={ariaLabel}>
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        aria-pressed={value === o.value}
        onClick={() => onChange(o.value)}
      >
        {o.label}
      </button>
    ))}
  </div>
)

// Right-hand sheet: one switch per module, backdrop, clock format.
// Opened from the rail control or the `,` key. Focus is trapped while open.
const SettingsSheet = ({ open, onClose }) => {
  const panelRef = useRef(null)
  const { settings, setBackdrop, setClock, toggleModule, reset } = useSettings()
  const { status } = useSession()
  const signedIn = status === 'in'

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (!panel) return

    const focusable = Array.from(panel.querySelectorAll(FOCUSABLE))
    focusable[0]?.focus()

    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab' || focusable.length === 0) return
      const index = focusable.indexOf(document.activeElement)
      if (e.shiftKey) {
        e.preventDefault()
        ;(index <= 0 ? focusable[focusable.length - 1] : focusable[index - 1]).focus()
      } else {
        e.preventDefault()
        ;(index === focusable.length - 1 ? focusable[0] : focusable[index + 1]).focus()
      }
    }

    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  const visibleModules = MODULES.filter((m) => signedIn || !m.auth)

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Close settings"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: REDUCED_MOTION ? 0 : 0.2 }}
            className="fixed inset-0 z-40 bg-black/45 cursor-default"
          />
          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Modules and backdrop"
            initial={REDUCED_MOTION ? false : { x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: REDUCED_MOTION ? 0 : ANIMATION.FAST, ease: ANIMATION.EASE }}
            className="fixed top-0 bottom-0 right-0 z-50 w-[min(400px,100%)] overflow-y-auto px-6 pt-5 pb-8 border-l border-hair-strong"
            style={{
              background: 'rgba(12, 15, 21, 0.92)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="label">Modules</h2>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-lg grid place-items-center text-ink-3 hover:text-ink hover:bg-panel transition-colors"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <p className="text-[12.5px] leading-relaxed text-ink-3 mb-2">
              Switch a module off and the grid re-packs. Choices are kept in this
              browser. Modules with nothing to show stay hidden regardless.
              {!signedIn && ' Sign in to see the rest of the modules.'}
            </p>

            <Group>
              {visibleModules.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="switch"
                  aria-checked={!!settings.modules[m.id]}
                  onClick={() => toggleModule(m.id)}
                  className="flex items-center gap-3 w-full py-2.5 text-left"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-ink">{m.name}</span>
                    <span className="block text-xs text-ink-3">{m.desc}</span>
                  </span>
                  <span className="switch" aria-hidden="true" />
                </button>
              ))}
            </Group>

            <Group title="Backdrop">
              <Seg
                ariaLabel="Backdrop"
                value={settings.backdrop}
                onChange={setBackdrop}
                options={[
                  { value: 'photo', label: 'Photo' },
                  { value: 'void', label: 'Void' },
                ]}
              />
              <p className="text-[12.5px] leading-relaxed text-ink-3 mt-2.5">
                Photo keeps a fresh wallpaper behind the panels. Void drops it for a
                flat ground with a faint grid.
              </p>
            </Group>

            <Group title="Clock">
              <Seg
                ariaLabel="Clock format"
                value={settings.clock}
                onChange={setClock}
                options={[
                  { value: '12', label: '12h' },
                  { value: '24', label: '24h' },
                ]}
              />
            </Group>

            <Group>
              <button
                type="button"
                onClick={reset}
                className="font-mono text-[11px] tracking-wide px-3 py-1.5 rounded-full border border-hair-strong text-ink hover:bg-panel-hover transition-colors"
              >
                Reset to defaults
              </button>
            </Group>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

export default SettingsSheet
