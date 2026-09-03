const BookRow = ({ book }) => {
  const authorText = book.authors?.join(', ')

  const progressText = (() => {
    if (book.readingProgress != null && book.pageCount > 0) {
      return `${book.readingProgress}% · ${book.pageCount} pages`
    }
    if (book.readingProgress != null) {
      return `${book.readingProgress}%`
    }
    if (book.pageCount > 0) {
      return `${book.pageCount} pages`
    }
    return null
  })()

  return (
    <a
      href={`https://bookgeek.clintgeek.com/books/${book.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block text-sm text-white/85 hover:text-white transition-colors"
    >
      <span className="break-words">{book.title}</span>
      {authorText && <span className="text-white/30"> · {authorText}</span>}
      {progressText && <span className="text-white/30"> · {progressText}</span>}
    </a>
  )
}

export default BookRow
