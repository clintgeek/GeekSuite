import { useMemo } from 'react'

const timeAgo = (iso) => {
  const seconds = (Date.now() - new Date(iso)) / 1000
  if (seconds < 60) return 'now'
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d`
  if (seconds < 31536000) return `${Math.floor(seconds / 2592000)}mo`
  return `${Math.floor(seconds / 31536000)}y`
}

// Title, tags, one line of snippet, age in mono on the right.
// Locked or encrypted notes arrive with a null snippet and say so.
const NoteRow = ({ note }) => {
  const relative = useMemo(() => timeAgo(note.updatedAt), [note.updatedAt])

  return (
    <div className="flex items-start gap-2.5 min-w-0">
      <a
        href={`https://notegeek.clintgeek.com/notes/${note.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 min-w-0 text-sm leading-snug text-ink hover:text-white transition-colors no-underline"
      >
        <span className="break-words">{note.title}</span>
        {note.tags?.length > 0 &&
          note.tags.map((tag) => (
            <span key={tag} className="ml-1.5 font-mono text-[10px] text-ink-3">
              #{tag}
            </span>
          ))}
        <span className="block mt-0.5 text-[12.5px] text-ink-3 truncate">
          {note.snippet ? note.snippet : <span className="italic">Locked note</span>}
        </span>
      </a>
      <span className="font-mono text-[11px] text-ink-3 tnum pt-0.5 shrink-0">{relative}</span>
    </div>
  )
}

export default NoteRow
