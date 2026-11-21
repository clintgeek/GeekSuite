import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useSession } from '../hooks/useSession'
import { useGlance } from '../hooks/useGlance'
import { useSettings } from '../hooks/useSettings'
import { useToast } from '../hooks/useToast'
import { useDisplay } from '../hooks/useLinkTarget'
import { openLink } from '../lib/linkTarget'
import { showShortcutChips } from '../lib/shortcutChips'
import { gql, UnauthorizedError } from '../lib/graphql'
import { failureMessage, isAuthFailure } from '../lib/commandFailure'
import { ENGINES } from '../lib/engines'
import { detectMode } from '../lib/commandMode'
import { parseTaskInput } from '@geeksuite/task-grammar'
import { shouldDraft, draftToSyntax } from '../lib/captureDraft'
import {
  CREATE_TASK,
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
import { slashFocusAction } from '../lib/slashFocus'
import {
  captureAttemptFor,
  createBusyGuard,
  describeCapture,
  draftFields,
  partialCaptureMessage,
  runTaskCapture,
} from '../lib/capture'

const ENGINE_STORAGE_KEY = 'startgeek.engine'

// On a phone the full placeholder is cut off after "> task", so the box
// shows a shorter one and, while it has focus and is empty, a row of the
// four prefixes that type the character for you (design review #8).
const PHONE_PLACEHOLDER = 'Search · > task · < note'
const DESKTOP_PLACEHOLDER = 'Search, or type  >  task,  <  note,  ?  suite search,  ??  ask'
const PREFIXES = [
  { insert: '> ', label: '> task', name: 'Start a task' },
  { insert: '< ', label: '< note', name: 'Start a note' },
  { insert: '? ', label: '? suite', name: 'Search the suite' },
  { insert: '?? ', label: '?? ask', name: 'Ask the suite' },
]
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

const getModeLabel = (mode, engine, status, asking, drafting, capturing) => {
  if (mode === 'web') return engine.label
  if (status === 'loading') return 'Connecting…'
  if (status === 'error') return 'Not connected'
  if (status !== 'in') {
    return mode === 'suite' || mode === 'ask'
      ? 'Sign in to search the suite'
      : 'Sign in to capture'
  }
  if (mode === 'task') return capturing ? 'Saving…' : drafting ? 'Drafting…' : 'Task → TodoGeek'
  if (mode === 'note') return capturing ? 'Saving…' : drafting ? 'Drafting…' : 'Note → NoteGeek'
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

const CommandBox = ({ onOpenSettings }) => {
  const { status, markOut } = useSession()
  const { refetch } = useGlance()
  const { settings } = useSettings()
  const { notify } = useToast()
  const askEnabled = !!settings.ask
  const hour12 = settings.clock !== '24'

  const [value, setValue] = useState('')
  const [engineIndex, setEngineIndex] = useState(getInitialEngineIndex)
  const [results, setResults] = useState([])
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [helpOpen, setHelpOpen] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [ask, setAsk] = useState(null)
  const [askLoading, setAskLoading] = useState(false)
  const [draft, setDraft] = useState(null)
  const [draftLoading, setDraftLoading] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [focused, setFocused] = useState(false)
  // True once the person taps the box; the page's own focus on load does
  // not count (lib/shortcutChips.js). Cleared when the box loses focus.
  const [userFocused, setUserFocused] = useState(false)
  const display = useDisplay()
  const { phone } = display
  // Enter on a result goes where a tap on it would (lib/linkTarget.js).
  const openUrl = useCallback((url) => openLink(url, display), [display])

  const inputRef = useRef(null)
  const searchDebounceRef = useRef(null)
  // The line "Edit" just handed back. It came from the model once already;
  // sending it straight back would be a loop, so the parser gets it whole.
  const skipDraftRef = useRef(null)
  // One Enter at a time: a double Enter (or the phone's Go key tapped twice)
  // on a slow gateway used to file the line twice (SUITE_REVIEW_2026-11 #8).
  const guardRef = useRef(null)
  if (!guardRef.current) guardRef.current = createBusyGuard()
  // The task capture in progress or last failed: its clientId and the steps
  // that finished. Enter on the same line again resumes it (lib/capture.js).
  const attemptRef = useRef(null)

  const { mode, query } = useMemo(() => detectMode(value), [value])
  const engine = ENGINES[engineIndex]
  const modeLabel = getModeLabel(mode, engine, status, askLoading, draftLoading, capturing)
  const showAskHint = mode === 'ask' && status === 'in' && !askEnabled

  // "Edit": the draft goes back into the box as the shorthand the parser
  // reads, so the next Enter is the deterministic path, not another model call.
  const handleEditDraft = useCallback(() => {
    if (!draft?.draft) return
    const prefix = draft.kind === 'note' ? '<' : '>'
    const text = `${prefix} ${draftToSyntax(draft, draft.kind === 'note' ? '' : query.trim())}`
    skipDraftRef.current = text.slice(1).trim()
    setDraft(null)
    setValue(text)
    inputRef.current?.focus()
  }, [draft, query])

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

  // '/' focuses the box from anywhere — the suite rule, StartGeek's own copy
  // (lib/slashFocus.js). Not from inside a field, not with Ctrl/Meta/Alt, and
  // not while the settings sheet or weather modal is over the box.
  useEffect(() => {
    const handleKey = (e) => {
      const otherModalOpen = Array.from(
        document.querySelectorAll('[role="dialog"][aria-modal="true"]')
      ).some((dialog) => dialog.getAttribute('aria-label') !== 'Command box help')
      const action = slashFocusAction(e, { helpOpen, otherModalOpen })
      if (!action) return
      e.preventDefault()
      if (action === 'close-help') setHelpOpen(false)
      inputRef.current?.focus()
    }

    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [helpOpen])

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
        // Deliberately quiet: this fires on every keystroke, and a toast per
        // character would be worse than the empty dropdown. Pressing Enter
        // runs the same query through `handleEnter`, which does report.
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
   * path — including defaulting to today at 9am, as TodoGeek's quick-add does.
   */
  const createTaskFromFields = useCallback(
    async (fields, key) => {
      const attempt = captureAttemptFor(attemptRef.current, key)
      attemptRef.current = attempt
      await runTaskCapture(fields, attempt, {
        createTask: async (variables) => (await gql(CREATE_TASK, variables)).createTask,
        createNote: (text) => handleCreateNote(text),
      })
      attemptRef.current = null
    },
    [handleCreateNote]
  )

  /** Captured. Clear the box, say so once, and let the modules catch up. */
  /**
   * Going-over 2026-09-05 — the capture and search paths used to swallow every
   * error that wasn't an `UnauthorizedError`:
   *
   *     } catch (err) {
   *       if (err instanceof UnauthorizedError) markOut()
   *     }
   *
   * A gateway 500, a validation rejection, a dropped connection, a CSRF 403
   * that the heal could not fix — all of them ended with the box unchanged and
   * nothing said. The person pressed Enter to file a task and, as far as the
   * page was concerned, nothing happened at all. The line stays in the box,
   * which is the right thing to do with it; this says why.
   */
  const reportFailure = useCallback(
    (err, fallback) => {
      if (isAuthFailure(err)) {
        markOut()
        return
      }
      // A task that was filed before a later step failed must say so, or
      // the person retypes it. Enter again finishes only the missing step.
      notify({
        // "Nothing to add" is a hint about the line, not a failure to pin.
        tone: err?.nothingToAdd ? 'info' : 'error',
        message: partialCaptureMessage(err, attemptRef.current) || failureMessage(err, fallback),
      })
    },
    [markOut, notify]
  )

  const captureDone = useCallback(
    (message) => {
      setDraft(null)
      skipDraftRef.current = null
      notify(message)
      setValue('')
      inputRef.current?.focus()
      refetch()
    },
    [refetch, notify]
  )

  const runEnter = useCallback(async () => {
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
            const fields = draftFields(draft.draft, q)
            await createTaskFromFields(fields, `draft:${JSON.stringify(draft.draft)}`)
            captureDone(describeCapture(fields, { hour12 }))
          }
        } catch (err) {
          reportFailure(err, draft.kind === 'note' ? "Couldn't save the note" : "Couldn't add the task")
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
          const fields = parseTaskInput(q)
          await createTaskFromFields(fields, `task:${q}`)
          captureDone(describeCapture(fields, { hour12 }))
        }
      } catch (err) {
        reportFailure(err, mode === 'note' ? "Couldn't save the note" : "Couldn't add the task")
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
          setResults([])
          setSelectedIndex(-1)
          reportFailure(fallbackErr, "Couldn't reach the suite")
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
        } else {
          notify(`Nothing in the suite matches "${q}"`)
        }
      } catch (err) {
        reportFailure(err, "Couldn't search the suite")
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
    reportFailure,
    ask,
    askEnabled,
    draft,
    hour12,
    notify,
    openUrl,
  ])

  // Every Enter (and the draft's Create) goes through the guard: while one is
  // in flight — a capture, a draft call, an Ask — a second is dropped.
  const handleEnter = useCallback(() => {
    if (mode === 'web') return runEnter()
    return guardRef.current.run(async () => {
      setCapturing(mode === 'task' || mode === 'note')
      try {
        await runEnter()
      } finally {
        setCapturing(false)
      }
    })
  }, [mode, runEnter])

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
          onPointerDown={() => setUserFocused(true)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            setUserFocused(false)
          }}
          placeholder={phone ? PHONE_PLACEHOLDER : DESKTOP_PLACEHOLDER}
          className="flex-1 min-w-0 bg-transparent text-ink placeholder:text-ink-3 text-[17px] focus:outline-none"
          aria-label="Command box"
          aria-autocomplete={mode === 'suite' || mode === 'ask' ? 'list' : 'none'}
          aria-controls={mode === 'suite' || mode === 'ask' ? 'search-results' : undefined}
        />

        {(searchLoading && mode === 'suite') || askLoading || draftLoading || capturing ? (
          <span className="w-1.5 h-1.5 rounded-full bg-ink-2 animate-pulse" aria-hidden="true" />
        ) : null}
        {/* On a phone the web engine is the least of it (there is no Tab to
            change it), so its chip gives the box room; every other mode
            keeps its label, which says where the line will go. */}
        {!(phone && mode === 'web') && (
          <span className="shrink-0 font-mono text-[12px] tracking-[0.06em] uppercase text-ink-2 px-2 sm:px-2.5 py-1.5 rounded-md border border-hair truncate max-w-[8.5rem] sm:max-w-[11rem]">
            {modeLabel}
          </span>
        )}
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
              <AnswerCard
                ask={ask}
                loading={askLoading}
                resultsCount={results.length}
                // A tapped term re-runs as a plain search (no `??`), the
                // cheapest way out of "read as a search, no matches".
                onKeyword={(kw) => setValue(kw)}
              />
            )}

            <SearchResults
              inline
              results={results}
              selectedIndex={selectedIndex}
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
              onHover={handleHoverResult}
            />
          </>
        )}
      </div>

      {showShortcutChips({ phone, focused, userFocused, value, signedIn: status === 'in' }) && (
        // Laid over the content, not in its flow: when a tap elsewhere blurs
        // the box, a row in the flow would vanish between touch-down and
        // touch-up and shift the page, so the tap missed what it aimed at
        // (a task's tick, for one).
        <div
          role="group"
          aria-label="Command shortcuts"
          className="absolute left-0 right-0 top-full mt-2 z-30 flex flex-wrap gap-2 pointer-events-none"
        >
          {PREFIXES.map((p) => (
            <button
              key={p.insert}
              type="button"
              aria-label={`${p.label}: ${p.name}`}
              // Keep the keyboard up: a tap here must not blur the box.
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setValue(p.insert)
                inputRef.current?.focus()
              }}
              className="pointer-events-auto min-h-[44px] px-3.5 rounded-full border border-hair-strong bg-[rgba(12,15,21,0.94)] font-mono text-[13px] text-ink-2 hover:text-ink"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </section>
  )
}

export default CommandBox
