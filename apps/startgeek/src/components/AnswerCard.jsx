import { motion } from 'framer-motion'

// The suite spells its own app names; the server sends the lowercase ids.
const APP_LABELS = {
  notegeek: 'NoteGeek',
  bujogeek: 'BujoGeek',
  bookgeek: 'BookGeek',
  flockgeek: 'FlockGeek',
}

// One chip per thing the model understood. Non-interactive, so they sit at the
// 12px floor rather than the 44px target size.
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
 * The Ask card: what the suite made of the question, above the results.
 *
 * Sits on the same dark glass as SearchResults so it reads over any wallpaper.
 * The answer is only ever what the server returned — when it is null the card
 * says so plainly rather than inventing a line.
 */
const AnswerCard = ({ ask, loading }) => {
  if (!loading && !ask) return null

  const intent = ask?.intent
  const answer = ask?.answer
  const askedForAnswer = intent?.kind === 'answer'

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      // The console's own ground sits under the panel so the module grid
      // behind does not ghost through the answer text.
      className="shrink-0 rounded-xl border border-hair-strong px-4 py-3.5 bg-ground"
      style={{
        backgroundImage:
          'linear-gradient(rgba(12, 15, 21, 0.9), rgba(12, 15, 21, 0.9))',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
      aria-live="polite"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="label !text-[12px] !text-ink-3">Ask</span>
        {loading && (
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" aria-hidden="true" />
        )}
      </div>

      {loading && (
        <p className="text-[15px] leading-relaxed text-ink-2">Thinking…</p>
      )}

      {!loading && answer && (
        <p className="text-[15px] leading-relaxed text-ink">{answer}</p>
      )}

      {!loading && !answer && askedForAnswer && (
        <p className="text-[13px] leading-relaxed text-ink-3">
          Nothing in your own data answers that. The closest matches are below.
        </p>
      )}

      {!loading && !answer && !askedForAnswer && intent && (
        <p className="text-[13px] leading-relaxed text-ink-3">
          Read as a search. Matches below.
        </p>
      )}

      {!loading && intent && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
          {intent.keywords?.map((kw) => (
            <Chip key={`kw-${kw}`} tone="accent">
              {kw}
            </Chip>
          ))}
          {intent.apps?.map((app) => (
            <Chip key={`app-${app}`}>{APP_LABELS[app] || app}</Chip>
          ))}
          {intent.since && <Chip>since {intent.since}</Chip>}
          {intent.shelf && <Chip>{intent.shelf}</Chip>}
          {intent.tags?.map((tag) => (
            <Chip key={`tag-${tag}`}>#{tag}</Chip>
          ))}
        </div>
      )}

      {!loading && (ask?.provider || ask?.model) && (
        <p className="mt-2.5 font-mono text-[12px] leading-none text-ink-3 truncate">
          {[ask.provider, ask.model].filter(Boolean).join(' · ')}
        </p>
      )}
    </motion.div>
  )
}

export default AnswerCard
