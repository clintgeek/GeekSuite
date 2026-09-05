import { motion } from 'framer-motion'
import { draftChips } from '../lib/captureDraft'

// One chip per thing the draft will create. Non-interactive, so they sit at
// the 12px floor rather than the 44px target size — same as the Ask card's.
const Chip = ({ tone = 'plain', children }) => (
  <span
    className={`inline-flex items-center h-[22px] px-2.5 rounded-full border font-mono text-[12px] leading-none whitespace-nowrap ${
      tone === 'accent'
        ? 'border-[rgba(230,179,90,0.35)] text-accent bg-accent-dim'
        : 'border-hair text-ink-2'
    }`}
  >
    {children}
  </span>
)

/**
 * The capture preview: what the model made of a line the parser could not read.
 *
 * Nothing has been saved at this point. Enter (or "Create") runs the same
 * mutation typing the shorthand by hand would have run; Esc (or "Edit") drops
 * the draft back into the box as that shorthand, and the parser takes it from
 * there. Either way the person, not the model, decides.
 */
const DraftPreview = ({ draft, loading, onCreate, onEdit }) => {
  if (!loading && !draft) return null

  const chips = draft ? draftChips(draft) : []

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      // The console's own ground under the glass, so the module grid behind
      // does not ghost through the draft.
      className="absolute left-0 right-0 top-full mt-2 z-40 rounded-xl border border-hair-strong px-4 py-3.5 bg-ground"
      style={{
        backgroundImage:
          'linear-gradient(rgba(12, 15, 21, 0.9), rgba(12, 15, 21, 0.9))',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
      aria-live="polite"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="label !text-[12px] !text-ink-3">Draft</span>
        {loading && (
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" aria-hidden="true" />
        )}
      </div>

      {loading && (
        <p className="text-[15px] leading-relaxed text-ink-2">Reading that…</p>
      )}

      {!loading && draft && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((chip) => (
              <Chip key={chip.key} tone={chip.tone}>
                {chip.text}
              </Chip>
            ))}
          </div>

          <p className="mt-2.5 text-[15px] leading-relaxed text-ink">
            {draft.summary || draft.draft?.content}
          </p>

          {(draft.provider || draft.model) && (
            <p className="mt-2 font-mono text-[12px] leading-none text-ink-3 truncate">
              {[draft.provider, draft.model].filter(Boolean).join(' · ')}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-3">
            <button
              type="button"
              onClick={onCreate}
              className="min-h-[44px] px-5 rounded-full border border-[rgba(230,179,90,0.35)] bg-accent-dim text-accent font-mono text-[12px] tracking-wide hover:bg-panel-hover transition-colors"
            >
              Create
              <span className="ml-2 text-ink-3">Enter</span>
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="min-h-[44px] px-5 rounded-full border border-hair-strong font-mono text-[12px] tracking-wide text-ink hover:bg-panel-hover transition-colors"
            >
              Edit
              <span className="ml-2 text-ink-3">Esc</span>
            </button>
          </div>
        </>
      )}
    </motion.div>
  )
}

export default DraftPreview
