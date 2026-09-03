import { useState } from 'react'
import Module from './Module'

const BOOKGEEK = 'https://bookgeek.clintgeek.com'

const TINTS = [
  ['#8a5a2b', '#3a2410'],
  ['#2f5d7a', '#122430'],
  ['#4f5d3a', '#1c2214'],
  ['#6b3a4e', '#2a151f'],
]

const tintFor = (id = '') => {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return TINTS[h % TINTS.length]
}

// The one book you're on: the most recently touched title on the Reading
// shelf. Cover from bookgeek's authenticated route (same-site cookie), with
// a tinted spine as the fallback.
const ReadingModule = ({ book }) => {
  const [coverFailed, setCoverFailed] = useState(false)
  const [c1, c2] = tintFor(book.id)
  const authorText = book.authors?.join(', ')
  const progress = Number.isFinite(book.readingProgress) ? Math.round(book.readingProgress) : null
  const pages = book.pageCount > 0 ? book.pageCount : null
  const page = progress != null && pages ? Math.round((progress / 100) * pages) : null

  return (
    <Module label="Reading" span={3} link={{ label: 'BookGeek', href: `${BOOKGEEK}/books/${book.id}` }}>
      <a
        href={`${BOOKGEEK}/books/${book.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex gap-4 items-start no-underline group flex-1"
      >
        <span
          className="block w-[56px] h-[84px] shrink-0 rounded-[3px] overflow-hidden"
          style={{
            background: `linear-gradient(160deg, ${c1}, ${c2})`,
            boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.18), 0 6px 14px rgba(0,0,0,0.45)',
          }}
        >
          {book.coverPath && !coverFailed && (
            <img
              src={`${BOOKGEEK}/api/books/${book.id}/cover`}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
              onError={() => setCoverFailed(true)}
            />
          )}
        </span>
        <span className="min-w-0 flex flex-col gap-1.5 flex-1">
          <span className="text-[15px] font-medium leading-snug text-ink group-hover:text-white transition-colors line-clamp-2">
            {book.title}
          </span>
          {authorText && <span className="text-[12.5px] text-ink-3 truncate">{authorText}</span>}
          {pages && <span className="font-mono text-[11px] text-ink-3 tnum">{pages} pages</span>}
        </span>
      </a>
      {progress != null ? (
        <div className="flex flex-col gap-1.5 mt-auto">
          <span className="meter" aria-hidden="true">
            <i style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
          </span>
          <span className="flex justify-between font-mono text-[11px] text-ink-3 tnum">
            <span>{progress}% read</span>
            {page != null && <span className="text-ink font-medium">p. {page}</span>}
          </span>
        </div>
      ) : (
        <span className="mt-auto font-mono text-[11px] text-ink-3">No progress set</span>
      )}
    </Module>
  )
}

export default ReadingModule
