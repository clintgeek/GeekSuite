import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useSession } from '../hooks/useSession'
import { useGlance } from '../hooks/useGlance'
import { gql, UnauthorizedError } from '../lib/graphql'
import { ENGINES } from '../lib/engines'
import { detectMode } from '../lib/commandMode'
import parseTaskInput from '../lib/parseTaskInput'
import {
  CREATE_TASK,
  BLOCK_TASK,
  CREATE_NOTE,
  GLANCE_SEARCH,
} from '../lib/queries'
import HelpButton from './HelpButton'
import HelpModal from './HelpModal'
import SearchResults from './SearchResults'
import Toast from './Toast'

const ENGINE_STORAGE_KEY = 'startgeek.engine'
const SUITE_DEBOUNCE_MS = 250

const getInitialEngineIndex = () => {
  try {
    const stored = localStorage.getItem(ENGINE_STORAGE_KEY)
    const index = ENGINES.findIndex((e) => e.id === stored)
    return index >= 0 ? index : 0
  } catch {
    return 0
  }
}

const getModeLabel = (mode, engine, status) => {
  if (mode === 'web') return engine.label
  if (status !== 'in') {
    return mode === 'suite' ? 'Sign in to search the suite' : 'Sign in to capture'
  }
  if (mode === 'task') return 'Task → BujoGeek'
  if (mode === 'note') return 'Note → NoteGeek'
  if (mode === 'suite') return 'Suite search'
  return engine.label
}

const createNoteFromText = async (text) => {
  const parts = text.split('\n')
  let title = null
  let content = text

  if (parts.length > 1) {
    title = parts[0].trim().slice(0, 60)
    content = parts.slice(1).join('\n').trim()
    if (!content) {
      content = text
    }
  }

  return gql(CREATE_NOTE, {
    title,
    content,
    type: 'text',
    tags: [],
  })
}

const openUrl = (url) => {
  window.open(url, '_blank', 'noopener,noreferrer')
}

const CommandBox = () => {
  const { status, markOut } = useSession()
  const { refetch } = useGlance()

  const [value, setValue] = useState('')
  const [engineIndex, setEngineIndex] = useState(getInitialEngineIndex)
  const [results, setResults] = useState([])
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [helpOpen, setHelpOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [searchLoading, setSearchLoading] = useState(false)

  const inputRef = useRef(null)
  const searchDebounceRef = useRef(null)

  const { mode, query } = useMemo(() => detectMode(value), [value])
  const engine = ENGINES[engineIndex]
  const modeLabel = getModeLabel(mode, engine, status)

  // Persist engine choice
  useEffect(() => {
    try {
      localStorage.setItem(ENGINE_STORAGE_KEY, engine.id)
    } catch {
      // ignore
    }
  }, [engine])

  // Focus on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Refocus when the window regains focus
  useEffect(() => {
    const handleWindowFocus = () => {
      if (!helpOpen) {
        inputRef.current?.focus()
      }
    }
    window.addEventListener('focus', handleWindowFocus)
    return () => window.removeEventListener('focus', handleWindowFocus)
  }, [helpOpen])

  // '/' focuses the box from anywhere, unless a modifier is held or the
  // user is already in an editable field.
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key !== '/') return
      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return

      const target = e.target
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }

      e.preventDefault()
      setHelpOpen(false)
      inputRef.current?.focus()
    }

    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  // Esc closes modals / dropdowns and blurs the input
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key !== 'Escape') return

      if (helpOpen) {
        e.preventDefault()
        setHelpOpen(false)
        inputRef.current?.blur()
        return
      }

      if (results.length) {
        e.preventDefault()
        setResults([])
        setSelectedIndex(-1)
        inputRef.current?.blur()
        return
      }

      inputRef.current?.blur()
    }

    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [helpOpen, results.length])

  // Suite search debounce
  useEffect(() => {
    if (helpOpen) {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current)
        searchDebounceRef.current = null
      }
      setSearchLoading(false)
      return
    }

    if (mode !== 'suite') {
      setResults([])
      setSelectedIndex(-1)
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current)
        searchDebounceRef.current = null
      }
      return
    }

    const q = query.trim()
    if (!q) {
      setResults([])
      setSelectedIndex(-1)
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current)
        searchDebounceRef.current = null
      }
      return
    }

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current)
    }

    setSearchLoading(true)
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const data = await gql(GLANCE_SEARCH, { query: q, limit: 12 })
        const list = data.glanceSearch || []
        setResults(list)
        setSelectedIndex(list.length ? 0 : -1)
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          markOut()
        } else {
          setResults([])
          setSelectedIndex(-1)
        }
      } finally {
        setSearchLoading(false)
      }
    }, SUITE_DEBOUNCE_MS)

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current)
        searchDebounceRef.current = null
      }
    }
  }, [mode, query, markOut, helpOpen])

  const handleCreateNote = useCallback(
    async (text) => {
      await createNoteFromText(text)
    },
    []
  )

  const handleEnter = useCallback(async () => {
    if (mode === 'web') {
      const q = query.trim()
      if (!q) return
      window.location.href = `${engine.url}${encodeURIComponent(q)}`
      return
    }

    if (status !== 'in') return

    if (mode === 'task') {
      const q = query.trim()
      if (!q) return

      const parsed = parseTaskInput(q)

      try {
        const { createTask: task } = await gql(CREATE_TASK, {
          content: parsed.content || '',
          signifier: parsed.signifier,
          priority: parsed.priority,
          tags: parsed.tags || null,
          dueDate: parsed.dueDate ? parsed.dueDate.toISOString() : null,
          note: parsed.note || null,
          recurrenceRule: parsed.recurrenceRule || null,
        })

        if (parsed.noteGeekNote) {
          await handleCreateNote(parsed.noteGeekNote)
        }

        if (parsed.blocked) {
          await gql(BLOCK_TASK, {
            id: task.id,
            reason: parsed.blockedReason || null,
          })
        }

        setToast('Task added')
        setValue('')
        inputRef.current?.focus()
        refetch()
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          markOut()
        }
      }
      return
    }

    if (mode === 'note') {
      const q = query.trim()
      if (!q) return

      try {
        await handleCreateNote(q)
        setToast('Note saved')
        setValue('')
        inputRef.current?.focus()
        refetch()
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          markOut()
        }
      }
      return
    }

    if (mode === 'suite') {
      const q = query.trim()
      if (!q) {
        setHelpOpen(true)
        return
      }

      if (results.length > 0 && selectedIndex >= 0) {
        openUrl(results[selectedIndex].url)
        return
      }

      // Enter pressed before the debounced search completed — run it now.
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current)
        searchDebounceRef.current = null
      }

      setSearchLoading(true)
      try {
        const data = await gql(GLANCE_SEARCH, { query: q, limit: 12 })
        const list = data.glanceSearch || []
        setResults(list)
        setSelectedIndex(list.length ? 0 : -1)
        if (list.length) {
          openUrl(list[0].url)
        }
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          markOut()
        }
      } finally {
        setSearchLoading(false)
      }
    }
  }, [
    mode,
    query,
    engine,
    status,
    results,
    selectedIndex,
    refetch,
    markOut,
    handleCreateNote,
  ])

  const handleKeyDown = (e) => {
    if (e.key === 'Tab' && mode === 'web') {
      e.preventDefault()
      if (e.shiftKey) {
        setEngineIndex(
          (prev) => (prev - 1 + ENGINES.length) % ENGINES.length
        )
      } else {
        setEngineIndex((prev) => (prev + 1) % ENGINES.length)
      }
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      handleEnter()
      return
    }

    if (mode === 'suite' && results.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % results.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(
          (prev) => (prev - 1 + results.length) % results.length
        )
      }
    }
  }

  const handleHoverResult = (index) => {
    setSelectedIndex(index)
  }

  const handleSelectResult = (result) => {
    openUrl(result.url)
  }

  return (
    <section className="relative z-20 w-full">
      <div
        className="relative flex items-center gap-3 h-14 pl-5 pr-3.5 rounded-xl border border-hair-strong transition-[border-color,box-shadow] duration-150 focus-within:border-[rgba(127,180,230,0.65)] focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_4px_rgba(127,180,230,0.12),0_10px_40px_rgba(0,0,0,0.35)]"
        style={{
          background: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(18px) saturate(1.3)',
          WebkitBackdropFilter: 'blur(18px) saturate(1.3)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 10px 40px rgba(0,0,0,0.35)',
        }}
      >
        <span className="font-mono text-[15px] text-sky select-none" aria-hidden="true">›</span>
        <input
          ref={inputRef}
          type="text"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search, or type  >  for a task,  <  for a note,  ?  to search the suite"
          className="flex-1 min-w-0 bg-transparent text-ink placeholder:text-ink-3 text-[17px] focus:outline-none"
          aria-label="Command box"
          aria-autocomplete={mode === 'suite' ? 'list' : 'none'}
          aria-controls={mode === 'suite' ? 'search-results' : undefined}
        />

        {searchLoading && mode === 'suite' && (
          <span className="w-1.5 h-1.5 rounded-full bg-ink-2 animate-pulse" aria-hidden="true" />
        )}
        <span className="shrink-0 font-mono text-[11px] tracking-[0.06em] uppercase text-ink-2 px-2.5 py-1.5 rounded-md border border-hair truncate max-w-[11rem]">
          {modeLabel}
        </span>
        <HelpButton onClick={() => setHelpOpen(true)} />

        <SearchResults
          results={results}
          selectedIndex={selectedIndex}
          onSelect={handleSelectResult}
          onHover={handleHoverResult}
        />
      </div>

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <Toast message={toast} onClose={() => setToast(null)} />
    </section>
  )
}

export default CommandBox
