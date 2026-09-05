import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { ANIMATION } from '../constants'

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

const HelpModal = ({ open, onClose }) => {
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return

    const panel = panelRef.current
    if (!panel) return

    const focusable = Array.from(panel.querySelectorAll(FOCUSABLE))
    const first = focusable[0]
    if (first) {
      first.focus()
    }

    const handleKey = (e) => {
      if (e.key !== 'Tab' && e.key !== 'Escape') return

      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      if (focusable.length === 0) return

      const current = document.activeElement
      const index = focusable.indexOf(current)
      if (e.shiftKey) {
        const prev = index <= 0 ? focusable[focusable.length - 1] : focusable[index - 1]
        e.preventDefault()
        prev.focus()
      } else {
        const next = index === focusable.length - 1 ? focusable[0] : focusable[index + 1]
        e.preventDefault()
        next.focus()
      }
    }

    const handleClick = (e) => {
      if (panel && !panel.contains(e.target)) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKey)
    document.addEventListener('mousedown', handleClick)

    return () => {
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: ANIMATION.FAST }}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[22vh] px-4"
      style={{ background: 'rgba(0, 0, 0, 0.45)' }}
    >
      <motion.div
        ref={panelRef}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: ANIMATION.FAST, ease: ANIMATION.EASE }}
        className="w-full max-w-2xl rounded-2xl p-6 md:p-8 text-white/90"
        style={{
          background: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Command box help"
      >
        <div className="flex items-start justify-between mb-5">
          <h2 className="text-base font-semibold text-white">Command box help</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-white/50 hover:text-white/90 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded px-2 py-1"
          >
            Close
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section>
            <h3 className="text-sm font-semibold text-white mb-2">Web search</h3>
            <p className="text-sm text-white/70 leading-relaxed">
              Just type. Tab switches engine (Google, DuckDuckGo, Brave, Bing, Wikipedia).
              Your choice is remembered.
            </p>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-white mb-2">Keys</h3>
            <p className="text-sm text-white/70 leading-relaxed">
              <span className="font-mono text-white/90">/</span> focus box ·{' '}
              <span className="font-mono text-white/90">Tab</span> next engine ·{' '}
              <span className="font-mono text-white/90">Esc</span> close ·{' '}
              <span className="font-mono text-white/90">↑ ↓ Enter</span> in results
            </p>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-white mb-2">
              <span className="font-mono text-white/90">&gt;</span> Task → BujoGeek
            </h3>
            <p className="text-sm text-white/70 leading-relaxed">
              <code className="font-mono text-white/90">&gt; Call the vet #flock /tomorrow !high</code>
            </p>
            <ul className="mt-2 text-sm text-white/60 space-y-0.5">
              <li><span className="font-mono text-white/80">#tag</span> tag</li>
              <li><span className="font-mono text-white/80">!high</span> priority (high · medium · low)</li>
              <li><span className="font-mono text-white/80">/today</span> /tomorrow /mon … /2026-09-10</li>
              <li><span className="font-mono text-white/80">(daily)</span> recurrence</li>
              <li><span className="font-mono text-white/80">^note</span> task note</li>
              <li><span className="font-mono text-white/80">$^note</span> also creates a NoteGeek note</li>
              <li><span className="font-mono text-white/80">~blocked reason</span> park the task</li>
              <li><span className="font-mono text-white/80">@</span> at the start marks an event</li>
            </ul>
            <p className="mt-2 text-sm text-white/60 leading-relaxed">
              With Ask on, a line the shorthand can’t read — “remind me to call the
              vet friday afternoon” — is drafted by aiGeek and previewed first:
              Enter creates it, Esc drops it back in the box to edit.
            </p>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-white mb-2">
              <span className="font-mono text-white/90">&lt;</span> Note → NoteGeek
            </h3>
            <p className="text-sm text-white/70 leading-relaxed">
              <code className="font-mono text-white/90">&lt; remember the milk</code>
            </p>
            <p className="mt-2 text-sm text-white/60 leading-relaxed">
              With Ask on, a long line or one carrying <span className="font-mono text-white/80">#tags</span>{' '}
              is drafted with a title first — Enter saves it, Esc drops it back to edit.
            </p>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-white mb-2">
              <span className="font-mono text-white/90">?</span> Search the suite
            </h3>
            <p className="text-sm text-white/70 leading-relaxed">
              Notes, tasks, books, birds. Instant, local, as you type.
            </p>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-white mb-2">
              <span className="font-mono text-white/90">??</span> Ask the suite
            </h3>
            <p className="text-sm text-white/70 leading-relaxed">
              <code className="font-mono text-white/90">?? what am I reading</code>
            </p>
            <p className="mt-2 text-sm text-white/60 leading-relaxed">
              A question in plain words. aiGeek plans the search and answers from
              your own Things, citing the ones it used — or says nothing when the
              answer is not there. Press Enter to run it. Off until you switch on
              “Ask the suite with AI” in settings.
            </p>
          </section>
        </div>

        <p className="mt-8 text-xs text-white/35 text-center">
          Capture and suite search need you signed in.
        </p>
      </motion.div>
    </motion.div>
  )
}

export default HelpModal
