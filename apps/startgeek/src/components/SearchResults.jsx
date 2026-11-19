import { motion } from 'framer-motion'
import { useLinkTarget } from '../hooks/useLinkTarget'

// Each result is one link in a plain list item (axe nested-interactive:
// the row used to be role="option" wrapping a button). The arrow keys still
// move the highlight from the box and Enter opens it; the highlighted row
// carries aria-current so a screen reader can tell which one that is.
// `citations` and `inline` are only ever set in Ask mode; the `?` search
// passes neither and renders exactly as it always has — its own absolutely
// positioned dropdown, no citation rules.
const SearchResults = ({
  results,
  selectedIndex,
  onHover,
  citations = [],
  inline = false,
}) => {
  const targetProps = useLinkTarget()
  if (!results || results.length === 0) return null

  const cited = new Set(citations)

  return (
    <motion.ul
      id="search-results"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.15 }}
      className={
        inline
          ? 'flex-1 min-h-0 overflow-y-auto rounded-xl border border-hair-strong bg-ground'
          : 'absolute left-0 right-0 top-full mt-2 max-h-72 overflow-y-auto rounded-xl z-40 border border-hair-strong'
      }
      style={{
        ...(inline
          ? {
              // Same panel colour, over the console's ground so the module
              // grid behind does not ghost through the rows.
              backgroundImage:
                'linear-gradient(rgba(12, 15, 21, 0.9), rgba(12, 15, 21, 0.9))',
            }
          : { background: 'rgba(12, 15, 21, 0.9)' }),
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
      aria-label="Suite search results"
    >
      {results.map((result, index) => (
        <li key={result.id}>
          <a
            href={result.url}
            {...targetProps}
            aria-current={index === selectedIndex ? 'true' : undefined}
            onMouseEnter={() => onHover(index)}
            className={`block no-underline w-full text-left px-4 py-3 text-sm transition-colors border-l-2 ${
              cited.has(result.id) ? 'border-l-accent' : 'border-l-transparent'
            } ${
              index === selectedIndex
                ? 'bg-white/15 text-white'
                : 'text-white/80 hover:bg-white/10'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium truncate">{result.title}</span>
              <span className="text-xs text-white/40 uppercase tracking-wider shrink-0">
                {result.type}
              </span>
            </div>
            {result.snippet && (
              <p className="mt-0.5 text-xs text-white/50 truncate">
                {result.snippet}
              </p>
            )}
          </a>
        </li>
      ))}
    </motion.ul>
  )
}

export default SearchResults
