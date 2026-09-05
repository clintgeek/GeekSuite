import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSettings } from '../hooks/useSettings'
import { useSession } from '../hooks/useSession'
import { MODULES, DEFAULT_CALENDAR_COLOR } from '../config/modules'
import { ANIMATION, REDUCED_MOTION } from '../constants'

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

const Group = ({ title, children }) => (
  <div className="border-t border-hair py-4">
    {title && (
      <h3 className="label !text-[12px] !text-ink-3 mb-2.5 font-normal">{title}</h3>
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
  const { settings, setBackdrop, setClock, toggleModule, toggleAsk, setCalendars, reset } = useSettings()
  const { status } = useSession()
  const signedIn = status === 'in'

  const updateCalendar = (index, next) => {
    setCalendars((prev) => {
      const copy = [...prev]
      copy[index] = next
      return copy
    })
  }

  const addCalendar = () => {
    setCalendars((prev) => [
      ...prev,
      { url: '', label: '', color: DEFAULT_CALENDAR_COLOR },
    ])
  }

  const removeCalendar = (index) => {
    setCalendars((prev) => prev.filter((_, i) => i !== index))
  }

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
            className="pb-safe-sheet fixed top-0 bottom-0 right-0 z-50 w-[min(400px,100%)] overflow-y-auto px-6 pt-5 border-l border-hair-strong"
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
                className="hit44 w-8 h-8 rounded-lg grid place-items-center text-ink-3 hover:text-ink hover:bg-panel transition-colors"
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

            {signedIn && (
              <Group title="Ask">
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!settings.ask}
                  onClick={toggleAsk}
                  className="flex items-center gap-3 w-full min-h-[44px] py-2.5 text-left"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-ink">Ask the suite with AI</span>
                    <span className="block text-xs text-ink-3">
                      Type <span className="font-mono">??</span> to ask · drafts{' '}
                      <span className="font-mono">&gt;</span> and{' '}
                      <span className="font-mono">&lt;</span> captures the parser can’t read
                    </span>
                  </span>
                  <span className="switch" aria-hidden="true" />
                </button>
                <p className="text-[12.5px] leading-relaxed text-ink-3 mt-2.5">
                  Ask sends your question and the matching notes, tasks, books and birds
                  to aiGeek, which answers from that and nothing else. Locked and
                  encrypted notes are never included. Off by default;
                  <span className="font-mono"> ? </span> stays a plain, local search.
                </p>
                <p className="text-[12.5px] leading-relaxed text-ink-3 mt-2">
                  It also drafts captures: when the shorthand parser can’t read a
                  <span className="font-mono"> &gt; </span> or
                  <span className="font-mono"> &lt; </span> line, aiGeek proposes the
                  task or note and you confirm it. The parser is still tried first,
                  and nothing is saved until you press Enter.
                </p>
              </Group>
            )}

            <Group title="Calendars">
              {settings.calendars.length === 0 && (
                <p className="text-[12.5px] leading-relaxed text-ink-3 mb-2">
                  No calendars added yet.
                </p>
              )}
              {settings.calendars.map((cal, idx) => (
                <div key={idx} className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    value={cal.label || ''}
                    onChange={(e) => updateCalendar(idx, { ...cal, label: e.target.value })}
                    placeholder="Label"
                    className="w-24 min-w-0 bg-transparent border border-hair rounded px-2 py-1.5 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:border-hair-strong"
                  />
                  <input
                    type="text"
                    value={cal.url || ''}
                    onChange={(e) => updateCalendar(idx, { ...cal, url: e.target.value })}
                    placeholder="ICS URL"
                    className="flex-1 min-w-0 bg-transparent border border-hair rounded px-2 py-1.5 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:border-hair-strong"
                  />
                  <input
                    type="color"
                    value={cal.color || DEFAULT_CALENDAR_COLOR}
                    onChange={(e) => updateCalendar(idx, { ...cal, color: e.target.value })}
                    className="w-8 h-8 shrink-0 p-0 border-0 rounded overflow-hidden bg-transparent cursor-pointer"
                    aria-label={`Color for ${cal.label || 'calendar'}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeCalendar(idx)}
                    className="hit44 shrink-0 w-7 h-7 rounded-lg grid place-items-center text-ink-3 hover:text-ink hover:bg-panel transition-colors"
                    aria-label={`Remove ${cal.label || 'calendar'}`}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addCalendar}
                className="font-mono text-[12px] tracking-wide px-3 py-1.5 rounded-full border border-hair-strong text-ink hover:bg-panel-hover transition-colors min-h-[44px]"
              >
                Add calendar
              </button>
              <p className="text-[12.5px] leading-relaxed text-ink-3 mt-2.5">
                Paste the public ICS URL for each calendar. Google Calendar calls it
                “Secret address in iCal format”; Outlook calls it “Subscribe to this calendar”
                or provides an ICS link. A label and color help tell them apart in the pane.
              </p>
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
                className="font-mono text-[12px] tracking-wide px-3 py-1.5 rounded-full border border-hair-strong text-ink hover:bg-panel-hover transition-colors min-h-[44px]"
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
