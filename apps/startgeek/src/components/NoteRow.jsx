import { useMemo } from 'react'

const timeAgo = (iso) => {
  const date = new Date(iso)
  const now = new Date()
  const seconds = (now - date) / 1000

  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`
  if (seconds < 172800) return 'yesterday'
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)} days ago`
  if (seconds < 31536000) return `${Math.floor(seconds / 2592000)} months ago`
  return `${Math.floor(seconds / 31536000)} years ago`
}

const NoteRow = ({ note }) => {
  const relative = useMemo(() => timeAgo(note.updatedAt), [note.updatedAt])

  return (
    <a
      href={`https://notegeek.clintgeek.com/notes/${note.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block text-sm text-white/85 hover:text-white transition-colors"
    >
      <span className="break-words">{note.title}</span>
      <span className="ml-1.5 text-xs text-white/35">· {relative}</span>
      {note.tags?.length > 0 && (
        <span className="mt-1 flex flex-wrap gap-1.5">
          {note.tags.map((tag) => (
            <span
              key={tag}
              className="inline-block text-[10px] text-white/40 leading-tight px-1.5 py-0.5 rounded-full bg-white/[0.06]"
            >
              #{tag}
            </span>
          ))}
        </span>
      )}
    </a>
  )
}

export default NoteRow
