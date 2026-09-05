// The capture fallback's judgement layer: when the deterministic parser has
// plainly not understood a `>` or `<` line, and what to do with a draft once
// the model has sent one back.
//
// The parser stays first, always. `parseTaskInput` is a straight copy of
// BujoGeek's and is kept byte-identical to it, so the "did that work?" reading
// lives here instead of inside it.

import parseTaskInput from './parseTaskInput'

/** Below this, a line is too slight to be worth a model call. */
export const MIN_DRAFT_WORDS = 3

// Words that mean "when" to a person and nothing at all to the parser, which
// only reads a `/token`. When one of these survives into the content and no
// due date came out, the parser has quietly dropped the user's intent.
const TEMPORAL =
  /\b(today|tonight|tomorrow|yesterday|weekend|morning|afternoon|evening|noon|midnight|later|tonite|eod|asap|next\s+(?:week|month|year)|this\s+(?:week|month)|in\s+(?:a|an|\d+)\s+(?:hour|hours|day|days|week|weeks|month|months)|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|\d{1,2}\s*[ap]\.?m\.?|\d{1,2}:\d{2})\b/i

// The same, for urgency: the parser only reads `!high` / `!medium` / `!low`.
const URGENCY =
  /\b(urgent|urgently|asap|critical|important|high\s+priority|top\s+priority|low\s+priority|whenever|no\s+rush|someday|sometime)\b/i

// A `/something` the date regex could not read — the clearest failure there is,
// because the user reached for the syntax and missed.
const DATE_TOKEN = /(^|\s)\/\S/

const PRIORITY_WORD = { 1: 'high', 2: 'medium', 3: 'low' }

export const wordCount = (text) =>
  String(text ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length

/**
 * Run the deterministic parser and say how well it did.
 *
 * `ok` is the gate: true means the parser produced an entry worth saving as-is
 * and nothing else should happen. `confidence` is the same judgement as a
 * number — 1 clean, 0.5 parsed but with intent left on the floor, 0 nothing
 * usable — and `reasons` says why, for anyone debugging a surprise draft.
 */
export function readTaskInput(text) {
  const raw = String(text ?? '').trim()
  const parsed = parseTaskInput(raw)
  const rest = parsed.content || raw
  const reasons = []

  if (!parsed.content) reasons.push('no-content')
  if (!parsed.dueDate && DATE_TOKEN.test(raw)) reasons.push('unparsed-date-token')
  if (!parsed.dueDate && TEMPORAL.test(rest)) reasons.push('date-in-words')
  if (!parsed.priority && URGENCY.test(rest)) reasons.push('priority-in-words')

  const confidence = !parsed.content ? 0 : reasons.length ? 0.5 : 1

  return { parsed, ok: reasons.length === 0, confidence, reasons }
}

/**
 * The same reading for `<`, which has no parser to fail — the note path just
 * splits a title off the first line and saves the rest verbatim.
 *
 * From a single-line command box that gives a note no title at all, and buries
 * any `#tag` the user typed in the body as literal text. Those are the two
 * cases worth a draft; a short plain line is saved as typed, as it always was.
 */
export function readNoteInput(text) {
  const raw = String(text ?? '').trim()
  const reasons = []

  if (!raw) reasons.push('no-content')
  if (raw && !raw.includes('\n')) {
    if (/#[a-zA-Z0-9_-]+/.test(raw)) reasons.push('tags-in-body')
    if (wordCount(raw) >= 12) reasons.push('untitled-and-long')
  }

  const confidence = !raw ? 0 : reasons.length ? 0.5 : 1

  return { ok: reasons.length === 0, confidence, reasons }
}

/**
 * Should this line go to the model at all?
 *
 * Three gates, in cost order: the setting is on, the line is long enough to
 * have a shape, and the deterministic path could not read it.
 */
export function shouldDraft({ mode, text, askEnabled }) {
  if (!askEnabled) return false
  if (mode !== 'task' && mode !== 'note') return false
  if (wordCount(text) < MIN_DRAFT_WORDS) return false
  return mode === 'task' ? !readTaskInput(text).ok : !readNoteInput(text).ok
}

/** `Fri 2:00 PM` — the same short form the chip row and BujoGeek both use. */
export function formatDraftDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  const day = date.toLocaleDateString(undefined, { weekday: 'short' })
  const time = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${day} ${time}`
}

/**
 * The chips above the summary: what will be created, in the fewest words that
 * still say it. `Task · Fri 2:00 PM · !high · #flock`.
 */
export function draftChips({ kind, draft }) {
  if (!draft) return []

  const chips = [{ key: 'kind', tone: 'accent', text: kind === 'note' ? 'Note' : 'Task' }]

  if (kind === 'task') {
    if (draft.signifier === '@') chips.push({ key: 'sig', text: 'event' })
    const when = formatDraftDate(draft.dueDate)
    if (when) chips.push({ key: 'due', text: when })
    if (draft.priority) chips.push({ key: 'pri', text: `!${PRIORITY_WORD[draft.priority]}` })
  } else if (draft.title) {
    chips.push({ key: 'title', text: draft.title })
  }

  for (const tag of draft.tags || []) {
    chips.push({ key: `tag-${tag}`, text: `#${tag}` })
  }

  return chips
}

/** `2026-09-11T14:00:00` → `/2026-09-11 2:00pm`, which the parser reads back. */
function dateToSyntax(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  const pad = (n) => String(n).padStart(2, '0')
  const ymd = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

  const hours = date.getHours()
  const meridian = hours < 12 ? 'am' : 'pm'
  const hour12 = hours % 12 === 0 ? 12 : hours % 12

  return `/${ymd} ${hour12}:${pad(date.getMinutes())}${meridian}`
}

/**
 * Put a draft back into the box as the shorthand the parser understands, so
 * "Edit" hands control back to the deterministic path rather than to the model.
 * Round-trips: feeding this to `parseTaskInput` returns the same fields.
 */
export function draftToSyntax({ kind, draft }) {
  if (!draft) return ''

  if (kind === 'note') {
    const tags = (draft.tags || []).map((t) => `#${t}`).join(' ')
    return [draft.content, tags].filter(Boolean).join(' ')
  }

  const parts = []
  if (draft.signifier && draft.signifier !== '*') parts.push(draft.signifier)
  parts.push(draft.content)
  for (const tag of draft.tags || []) parts.push(`#${tag}`)
  if (draft.priority) parts.push(`!${PRIORITY_WORD[draft.priority]}`)

  const when = draft.dueDate ? dateToSyntax(draft.dueDate) : null
  if (when) parts.push(when)

  return parts.filter(Boolean).join(' ')
}
