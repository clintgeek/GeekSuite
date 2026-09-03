import { motion } from 'framer-motion'

const SearchResults = ({ results, selectedIndex, onSelect, onHover }) => {
  if (!results || results.length === 0) return null

  return (
    <motion.ul
      id="search-results"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.15 }}
      className="absolute left-0 right-0 top-full mt-2 max-h-72 overflow-y-auto rounded-xl z-40 border border-hair-strong"
      style={{
        background: 'rgba(12, 15, 21, 0.9)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
      role="listbox"
      aria-label="Suite search results"
    >
      {results.map((result, index) => (
        <li key={result.id} role="option" aria-selected={index === selectedIndex}>
          <button
            type="button"
            onClick={() => onSelect(result)}
            onMouseEnter={() => onHover(index)}
            className={`w-full text-left px-4 py-3 text-sm transition-colors ${
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
          </button>
        </li>
      ))}
    </motion.ul>
  )
}

export default SearchResults
