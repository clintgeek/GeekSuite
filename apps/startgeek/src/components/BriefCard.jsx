import { motion, AnimatePresence } from 'framer-motion'
import { useMorningBrief } from '../hooks/useMorningBrief'
import { provenanceLine } from '../lib/morningBrief'

/**
 * The morning brief: the day the modules already show, read once as three
 * short sentences (AI_IDEAS.md #5).
 *
 * Display-only, on purpose. There is not one action in this card and there
 * never will be — the tasks it mentions are one tap away in their own module,
 * and a brief you can act on is a second, competing task list. The only
 * control is the one that makes it go away until tomorrow.
 *
 * It renders nothing at all unless there is a brief: opt-in off, before 5 a.m.
 * local, already dismissed today, a gateway error, or a server that answered
 * `brief: null` all land in the same place — an empty hero, silently.
 */
const BriefCard = () => {
  const { brief, provenance, dismiss } = useMorningBrief()

  return (
    <AnimatePresence>
      {brief && (
        <motion.section
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
          aria-label="Morning brief"
          aria-live="polite"
          // The same dark glass every module wears, minus `.mod`'s 200px
          // floor — this is a three-sentence strip, not a panel.
          className="relative mb-4 rounded-xl border border-hair px-4 py-3.5"
          style={{
            background: 'var(--panel)',
            backdropFilter: 'blur(18px) saturate(1.2)',
            WebkitBackdropFilter: 'blur(18px) saturate(1.2)',
            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 10px 30px rgba(0, 0, 0, 0.25)',
          }}
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <span className="label !text-[12px] !text-ink-3">Morning brief</span>
              <p className="mt-2 text-[15px] leading-relaxed text-ink">{brief}</p>
              {/* Every AI-touched surface in the suite says where its words
                  came from. "no model today" is the deterministic brief. */}
              <p className="mt-2.5 font-mono text-[12px] leading-none text-ink-3 truncate">
                {provenanceLine(provenance)}
              </p>
            </div>

            <button
              type="button"
              onClick={dismiss}
              className="hit44 shrink-0 w-8 h-8 rounded-lg grid place-items-center text-ink-3 border border-transparent hover:text-ink hover:border-hair-strong hover:bg-panel transition-colors"
              aria-label="Dismiss the morning brief until tomorrow"
              title="Dismiss until tomorrow"
            >
              ✕
            </button>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  )
}

export default BriefCard
