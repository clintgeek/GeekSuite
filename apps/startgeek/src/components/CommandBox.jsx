import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useSession } from '../hooks/useSession'
import { useGlance } from '../hooks/useGlance'
import { useSettings } from '../hooks/useSettings'
import { gql, UnauthorizedError } from '../lib/graphql'
import { ENGINES } from '../lib/engines'
import { detectMode } from '../lib/commandMode'
import parseTaskInput from '../lib/parseTaskInput'
import { shouldDraft, draftToSyntax } from '../lib/captureDraft'
import {
  CREATE_TASK,
  BLOCK_TASK,
  CREATE_NOTE,
  GLANCE_SEARCH,
  GLANCE_ASK,
  GLANCE_DRAFT,
} from '../lib/queries'
import HelpButton from './HelpButton'
import HelpModal from './HelpModal'
import SearchResults from './SearchResults'
import AnswerCard from './AnswerCard'
import DraftPreview from './DraftPreview'
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

const getModeLabel = (mode, engine, status, asking, drafting) => {
  if (mode === 'web') return engine.label
  if (status !== 'in') {
    return mode === 'suite' || mode === 'ask'
      ? 'Sign in to search the suite'
      : 'Sign in to capture'
  }
  if (mode === 'task') return drafting ? 'Drafting…' : 'Task → BujoGeek'
  if (mode === 'note') return drafting ? 'Drafting…' : 'Note → NoteGeek'
  if (mode === 'suite') return 'Suite search'
  if (mode === 'ask') return asking ? 'Thinking…' : 'Ask the suite'
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

const CommandBox = ({ onOpenSettings }) => {
  const { status, markOut } = useSession()
  const { refetch } = useGlance()
  const { settings } = useSettings()
  const askEnabled = !!settings.ask

  const [value, setValue] = useState('')
  const [engineIndex, setEngineIndex] = useState(getInitialEngineIndex)
  const [results, setResults] = useState([])
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [helpOpen, setHelpOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [ask, setAsk] = useState(null)
  const [askLoading, setAskLoading] = useState(false)
  const [draft, setDraft] = useState(null)
  const [draftLoading, setDraftLoading] = useState(false)

  const inputRef = useRef(null)
  const searchDebounceRef = useRef(null)
  // The line "Edit" just handed back. It came from the model once already;
  // sending it straight back would be a loop, so the parser gets it whole.
  const skipDraftRef = useRef(null)

  const { mode, query } = useMemo(() => detectMode(value), [value])
  const engine = ENGINES[engineIndex]
  const modeLabel = getModeLabel(mode, engine, status, askLoading, draftLoading)
  const showAskHint = mode === 'ask' && status === 'in' && !askEnabled

  // "Edit": the draft goes back into the box as the shorthand the parser
  // reads, so the next Enter is the deterministic path, not another model call.
  const handleEditDraft = useCallback(() => {
    if (!draft?.draft) return
    const prefix = draft.kind === 'note' ? '<' : '>'
    const text = `${prefix} ${draftToSyntax(draft)}`
    skipDraftRef.current = text.slice(1).trim()
    setDraft(null)
    setValue(text)
    inputRef.current?.focus()
  }, [draft])

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

  // Refocus when the window regains focus — but only where a mouse makes
  // that free (a hardware keyboard is implied). On a phone this would pop
  // the on-screen keyboard every time the user returns to the tab.
  useEffect(() => {
    const handleWindowFocus = () => {
      if (helpOpen) return
      if (!window.matchMedia?.('(hover: hover)').matches) return
      inputRef.current?.focus()
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

      // A draft on screen is an offer, not a state to escape from: Esc takes
      // it into the box to edit rather than throwing the sentence away.
      if (draft?.draft) {
        e.preventDefault()
        handleEditDraft()
        return
      }

      if (results.length || ask) {
        e.preventDefault()
        setResults([])
        setSelectedIndex(-1)
        setAsk(null)
        inputRef.current?.blur()
        return
      }

      inputRef.current?.blur()
    }

    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [helpOpen, results.length, ask, draft, handleEditDraft])

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

    // Ask never searches as you type — it costs a model call, so it waits
    // for Enter. Editing the query drops the previous answer.
    if (mode !== 'suite') {
      setResults([])
      setSelectedIndex(-1)
      setAsk(null)
      // Editing the line invalidates the draft made from it.
      setDraft(null)
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

  /**
   * The one place a task is written, whether the fields came from the parser
   * or from a draft the person confirmed. Unchanged from the parser's own
   * path — including defaulting to today at 9am, as BujoGeek's quick-add does.
   */
  const createTaskFromFields = useCallback(
    async (fields) => {
      let dueDate = fields.dueDate ? new Date(fields.dueDate) : null
      if (!dueDate || Number.isNaN(dueDate.getTime())) {
        dueDate = new Date()
        dueDate.setHours(9, 0, 0, 0)
      }

      const { createTask: task } = await gql(CREATE_TASK, {
        content: fields.content || '',
        signifier: fields.signifier || '*',
        priority: fields.priority || null,
        tags: fields.tags?.length ? fields.tags : null,
        dueDate: dueDate.toISOString(),
        note: fields.note || null,
        recurrenceRule: fields.recurrenceRule || null,
      })

      if (fields.noteGeekNote) {
        await handleCreateNote(fields.noteGeekNote)
      }

      if (fields.blocked) {
        await gql(BLOCK_TASK, {
          id: task.id,
          reason: fields.blockedReason || null,
        })
      }
    },
    [handleCreateNote]
  )

  /** Captured. Clear the box, say so once, and let the modules catch up. */
  const captureDone = useCallback(
    (message) => {
      setDraft(null)
      skipDraftRef.current = null
      setToast(message)
      setValue('')
      inputRef.current?.focus()
      refetch()
    },
    [refetch]
  )

  const handleEnter = useCallback(async () => {
    if (mode === 'web') {
      const q = query.trim()
      if (!q) return
      window.location.href = `${engine.url}${encodeURIComponent(q)}`
      return
    }

    if (status !== 'in') return

    if (mode === 'task' || mode === 'note') {
      const q = query.trim()
      if (!q) return

      // A draft is on screen: this Enter confirms it. The model's fields only
      // ever become a row here, on a keystroke the person made.
      if (draft?.draft) {
        try {
          if (draft.kind === 'note') {
            await gql(CREATE_NOTE, {
              title: draft.draft.title || null,
              content: draft.draft.content,
              type: 'text',
              tags: draft.draft.tags || [],
            })
            captureDone('Note saved')
          } else {
            await createTaskFromFields(draft.draft)
            captureDone('Task added')
          }
        } catch (err) {
          if (err instanceof UnauthorizedError) {
            markOut()
          }
        }
        return
      }

      // The deterministic parser goes first, always. Only a line it could not
      // read — with Ask on, and enough words to have a shape — reaches the
      // model, and even then it only drafts: nothing is saved yet.
      const askForDraft =
        skipDraftRef.current !== q && shouldDraft({ mode, text: q, askEnabled })

      if (askForDraft) {
        setDraftLoading(true)
        try {
          const data = await gql(GLANCE_DRAFT, { input: q, kind: mode })
          const drafted = data.glanceDraft
          if (drafted && !drafted.degraded && drafted.draft) {
            setDraft(drafted)
            return
          }
          // Degraded: the model is off, slow or wrong. Carry on as if it were
          // never wired up.
        } catch (err) {
          if (err instanceof UnauthorizedError) {
            markOut()
            return
          }
          // Anything else falls through to today's behaviour, silently — the
          // only thing the person sees is the usual capture toast.
        } finally {
          setDraftLoading(false)
        }
      }

      try {
        if (mode === 'note') {
          await handleCreateNote(q)
          captureDone('Note saved')
        } else {
          await createTaskFromFields(parseTaskInput(q))
          captureDone('Task added')
        }
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          markOut()
        }
      }
      return
    }

    if (mode === 'ask') {
      const q = query.trim()
      if (!q) {
        setHelpOpen(true)
        return
      }
      if (!askEnabled) return

      // A second Enter on a highlighted row opens it, same as suite search.
      if (ask && results.length > 0 && selectedIndex >= 0) {
        openUrl(results[selectedIndex].url)
        return
      }

      setAskLoading(true)
      try {
        const data = await gql(GLANCE_ASK, { query: q, limit: 12 })
        const payload = data.glanceAsk || null
        const list = payload?.results || []
        setAsk(payload)
        setResults(list)
        setSelectedIndex(list.length ? 0 : -1)
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          markOut()
          return
        }

        // Ask failed. Fall back to the search that always works.
        setAsk(null)
        try {
          const data = await gql(GLANCE_SEARCH, { query: q, limit: 12 })
          const list = data.glanceSearch || []
          setResults(list)
          setSelectedIndex(list.length ? 0 : -1)
        } catch (fallbackErr) {
          if (fallbackErr instanceof UnauthorizedError) {
            markOut()
          } else {
            setResults([])
            setSelectedIndex(-1)
          }
        }
      } finally {
        setAskLoading(false)
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
    markOut,
    handleCreateNote,
    createTaskFromFields,
    captureDone,
    ask,
    askEnabled,
    draft,
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

    if ((mode === 'suite' || mode === 'ask') && results.length > 0) {
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
    // Ask stacks a card above the result list, which is taller than the plain
    // `?` dropdown — it needs to clear the dock. `?` keeps its original z-20.
    <section
      className={`relative w-full ${
        mode === 'ask' || draft || draftLoading ? 'z-40' : 'z-20'
      }`}
    >
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
          placeholder="Search, or type  >  task,  <  note,  ?  suite search,  ??  ask"
          className="flex-1 min-w-0 bg-transparent text-ink placeholder:text-ink-3 text-[17px] focus:outline-none"
          aria-label="Command box"
          aria-autocomplete={mode === 'suite' || mode === 'ask' ? 'list' : 'none'}
          aria-controls={mode === 'suite' || mode === 'ask' ? 'search-results' : undefined}
        />

        {(searchLoading && mode === 'suite') || askLoading || draftLoading ? (
          <span className="w-1.5 h-1.5 rounded-full bg-ink-2 animate-pulse" aria-hidden="true" />
        ) : null}
        <span className="shrink-0 font-mono text-[12px] tracking-[0.06em] uppercase text-ink-2 px-2.5 py-1.5 rounded-md border border-hair truncate max-w-[11rem]">
          {modeLabel}
        </span>
        <HelpButton onClick={() => setHelpOpen(true)} />

        {mode === 'ask' ? (
          // Card and list are one bounded block: the card stays put, the
          // list scrolls inside it, and neither runs under the dock.
          <div className="ask-bounds absolute left-0 right-0 top-full mt-2 z-40 flex flex-col gap-2 rounded-xl bg-ground">
            {showAskHint ? (
              <div
                className="shrink-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hair-strong px-4 py-2.5 bg-ground"
                style={{
                  backgroundImage:
                    'linear-gradient(rgba(12, 15, 21, 0.9), rgba(12, 15, 21, 0.9))',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                }}
              >
                <span className="text-[13px] text-ink-2">
                  Ask is off — turn it on in Settings
                </span>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="min-h-[44px] px-4 rounded-full border border-hair-strong font-mono text-[12px] tracking-wide text-ink hover:bg-panel-hover transition-colors"
                >
                  Open settings
                </button>
              </div>
            ) : (
              <AnswerCard ask={ask} loading={askLoading} />
            )}

            <SearchResults
              inline
              results={results}
              selectedIndex={selectedIndex}
              onSelect={handleSelectResult}
              onHover={handleHoverResult}
              citations={ask?.citations || []}
            />
          </div>
        ) : (
          <>
            {/* The capture fallback sits in the same slot the `?` dropdown
                uses — nothing is saved until Create is pressed. */}
            <DraftPreview
              draft={draft}
              loading={draftLoading}
              onCreate={handleEnter}
              onEdit={handleEditDraft}
            />
            <SearchResults
              results={results}
              selectedIndex={selectedIndex}
              onSelect={handleSelectResult}
              onHover={handleHoverResult}
            />
          </>
        )}
      </div>

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <Toast message={toast} onClose={() => setToast(null)} />
    </section>
  )
}

export default CommandBox
