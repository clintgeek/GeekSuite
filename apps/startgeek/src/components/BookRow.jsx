import { useState } from 'react'

const BOOKGEEK = 'https://bookgeek.clintgeek.com'

// Two muted cover tints so a missing cover still reads as a book spine.
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

// Cover thumbnail, title, author and page count, progress hairline.
// The cover comes from bookgeek's authenticated route; the SSO cookie is
// same-site so the <img> carries it. On a miss we fall back to the tint.
const BookRow = ({ book }) => {
  const [coverFailed, setCoverFailed] = useState(false)
  const [c1, c2] = tintFor(book.id)
  const authorText = book.authors?.join(', ')
  const progress = Number.isFinite(book.readingProgress) ? book.readingProgress : null
  const pages = book.pageCount > 0 ? book.pageCount : null
  const page = progress != null && pages ? Math.round((progress / 100) * pages) : null

  return (
    <a
      href={`${BOOKGEEK}/books/${book.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="grid grid-cols-[34px_1fr] gap-3 items-start no-underline group"
    >
      <span
        className="block w-[34px] h-[50px] rounded-[3px] overflow-hidden"
        style={{
          background: `linear-gradient(160deg, ${c1}, ${c2})`,
          boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.18), 0 4px 10px rgba(0,0,0,0.4)',
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
      <span className="min-w-0 flex flex-col gap-1.5">
        <span className="text-sm font-medium leading-snug text-ink group-hover:text-white transition-colors truncate">
          {book.title}
        </span>
        {(authorText || pages) && (
          <span className="text-[12.5px] text-ink-3 truncate -mt-1">
            {authorText}
            {authorText && pages && ' · '}
            {pages && `${pages} pages`}
          </span>
        )}
        {progress != null && (
          <>
            <span className="meter" aria-hidden="true">
              <i style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
            </span>
            <span className="flex justify-between font-mono text-[11px] text-ink-3 tnum">
              <span>{progress}%</span>
              {page != null && <span className="text-ink font-medium">p. {page}</span>}
            </span>
          </>
        )}
      </span>
    </a>
  )
}

export default BookRow
