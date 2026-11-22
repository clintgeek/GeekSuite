/**
 * journalLines.js — a sketch's transcript read as a bullet journal
 * (DOCS/BUJO_HANDWRITING.md). Pure.
 *
 * The mark that opens a handwritten line says what the line is. The
 * transcription prompt writes each mark as a fixed character (gateway
 * `transcribe.js` rule 4); this reads them, and then hands the rest of the
 * line to TodoGeek's OWN parser (`@geeksuite/task-grammar`), so `!high`,
 * `#tags`, `/friday`, "tomorrow 2pm" and `(private)` mean exactly what they
 * mean typed into TodoGeek's add box.
 *
 *   handwritten            transcript   kind        in TodoGeek
 *   •  dot bullet          * text       task        "*" task, pending
 *   ☐  empty box           [ ] text     task        "*" task, pending
 *   ×  cross / ticked box  x text, [x]  done        "*" task, completed
 *   ○  open circle         o text       event       "@" event
 *   –  dash                - text       note        "-" note
 *   !  exclamation         ! text       important   "!" important
 *   ?  question mark       ? text       question    "?" question
 *   >  migrated            > text       migrated    "*" task (already carried)
 *   <  scheduled           < text       scheduled   "*" task (already filed)
 *
 * Open things are offered ticked (task, important, question, event); done,
 * notes and already-moved lines are listed unticked, so one tap adds them but
 * nothing is sent that the page says is finished or filed.
 *
 * Indentation is ignored (TodoGeek subtasks are a later step). A line with no
 * opening mark is prose and is not an entry — which covers `--- page N ---`
 * markers, `[drawing: …]` and `[no writing]` without a rule of their own.
 */
import { parseTaskInputDetailed, toCreateInput } from '@geeksuite/task-grammar';

// ONE mark table, shared by "Send tasks" (below) and Convert's "Keep as plain
// text" (sketchToText.js `journalMarkAsMarkdown`), so the two can never read
// the same line differently (review 2.9).
//
// `[ ]` needs no space after it: the transcription prompt writes `[ ]buy milk`
// as often as `[ ] buy milk`. `x`, `>` and `<` must be followed by a LETTER:
// `x 3 sets of 10` is a set count and `> 5 kg flour` a quantity, not a done or
// migrated entry. Numbered lines are offered, unticked.
const CHECKBOX = /^(?:[-*•]\s+)?\[( |x|X|✓|✔)?\]\s*(?=\S)/;
export const MARKS = [
  { kind: 'done', re: /^(?:x|X|×|✗|✘|✓|✔)\s+(?=\p{L})/u },
  { kind: 'task', re: /^(?:\*|•|·|∙|●)\s+(?=\S)/ },
  { kind: 'event', re: /^(?:o|O|○|◯|◦|@)\s+(?=\S)/ },
  { kind: 'note', re: /^(?:-|–|—)\s+(?=\S)/ },
  { kind: 'migrated', re: /^>\s+(?=\p{L})/u },
  { kind: 'scheduled', re: /^<\s+(?=\p{L})/u },
  { kind: 'important', re: /^!\s+(?=\S)/ },
  { kind: 'question', re: /^\?\s+(?=\S)/ },
  { kind: 'numbered', re: /^\d{1,3}[.)]\s+(?=\S)/ },
];

export const KIND = {
  task: { label: 'Task', signifier: '*', status: null, defaultOn: true },
  important: { label: 'Important', signifier: '!', status: null, defaultOn: true },
  question: { label: 'Question', signifier: '?', status: null, defaultOn: true },
  event: { label: 'Event', signifier: '@', status: null, defaultOn: true },
  done: { label: 'Done', signifier: '*', status: 'completed', defaultOn: false },
  note: { label: 'Note', signifier: '-', status: null, defaultOn: false },
  migrated: { label: 'Migrated', signifier: '*', status: null, defaultOn: false },
  scheduled: { label: 'Scheduled', signifier: '*', status: null, defaultOn: false },
  // A numbered list on the page: maybe tasks, maybe steps. Offered, unticked.
  numbered: { label: 'Numbered', signifier: '*', status: null, defaultOn: false },
};

/** A short stable key for "this line of this sketch" (FNV-1a over kind + words). */
export function lineKey(kind, text) {
  const s = `${kind}|${String(text).toLowerCase().replace(/\s+/g, ' ').trim()}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${kind}:${h.toString(16).padStart(8, '0')}:${s.length}`;
}

/** One opening mark: `{ kind, style, length }` or null. */
function oneMark(s) {
  const box = CHECKBOX.exec(s);
  if (box) return { kind: box[1] && box[1] !== ' ' ? 'done' : 'task', style: box[1] && box[1] !== ' ' ? 'checked' : 'box', length: box[0].length };
  for (const { kind, re } of MARKS) {
    const m = re.exec(s);
    if (m) return { kind, style: kind, length: m[0].length };
  }
  return null;
}

const hasWords = (s) => /[\p{L}\p{N}]/u.test(s);

/**
 * The opening mark of a line, read with the shared table, and how it was
 * drawn: `{ kind, text, style, indent, markLength }` or null for prose.
 *
 * A second mark is stripped (`! * call bob` is an important "call bob"); the
 * more specific of the two wins over a plain task dot (`* ! call bob` is
 * important too, as TodoGeek's typed signifier would make it). A line with no
 * letter or digit left (`* * *`, a rule) is not an entry.
 */
export function readMarkDetailed(line) {
  const raw = String(line ?? '');
  const indent = /^\s*/.exec(raw)[0];
  const s = raw.slice(indent.length).trimEnd();
  if (!s) return null;
  const first = oneMark(s);
  if (!first) return null;
  let rest = s.slice(first.length);
  let kind = first.kind;
  let markLength = first.length;
  // A second mark is only a symbol: "* x ray results" and "* o ring" are words.
  const second = first.kind === 'numbered' || /^[xXoO]\s/.test(rest) ? null : oneMark(rest);
  if (second && second.kind !== 'numbered') {
    if (kind === 'task' && first.style === 'task' && second.kind !== 'task') kind = second.kind;
    rest = rest.slice(second.length);
    markLength += second.length;
  }
  const text = rest.trim();
  if (!text || !hasWords(text)) return null;
  return { kind, text, style: first.style, indent, markLength, firstLength: first.length, mark: s.slice(0, first.length).trim() };
}

/** What kind of journal line this is and its words, or null for prose. */
export function readMark(line) {
  const m = readMarkDetailed(line);
  return m ? { kind: m.kind, text: m.text } : null;
}

/**
 * The journal entries in a transcript, in page order.
 * @returns {Array<{ key, kind, text, line, unsure, defaultOn }>}
 */
export function journalLines(transcript) {
  const out = [];
  const seen = new Set();
  String(transcript ?? '').replace(/\r\n?/g, '\n').split('\n').forEach((raw, line) => {
    const mark = readMark(raw);
    if (!mark) return;
    let key = lineKey(mark.kind, mark.text);
    // The same words twice on a page are two lines: keep both, tell them apart.
    for (let n = 2; seen.has(key); n += 1) key = `${lineKey(mark.kind, mark.text)}#${n}`;
    seen.add(key);
    out.push({
      key,
      kind: mark.kind,
      text: mark.text,
      // What was read, before any edit in the Send dialog (corrections, 1.11).
      original: mark.text,
      line,
      // The model marks a word it could not read with [?]: worth a look before sending.
      unsure: mark.text.includes('[?]'),
      defaultOn: KIND[mark.kind].defaultOn,
    });
  });
  return out;
}

/** What TodoGeek's parser understood in the words of an entry. */
export function understand(text, { now = new Date() } = {}) {
  return parseTaskInputDetailed(String(text ?? ''), { now });
}

/**
 * The createTask input for an entry — TodoGeek's own mapping (no date → today,
 * date-only), with the journal mark deciding the signifier and status, and a
 * line saying which sketch it came from.
 *
 * `now` anchors the words' relative dates ("tomorrow", "/friday"): the day
 * the page was written, when the Send dialog anchors to it (review 2.10).
 * `today` is where a line with NO date lands — always the real today, as in
 * TodoGeek's add box: an undated line is "do it now-ish", not overdue.
 *
 * @param {{ kind: string, text: string }} entry
 * @param {{ now?: Date, today?: Date, sketch?: { id?: string, title?: string }, origin?: string, tags?: string[] }} [o]
 * @returns {object|null} null when there are no words left to make a task of
 */
export function taskInputFor(entry, { now = new Date(), today = now, sketch = null, origin = '', tags = [] } = {}) {
  const parsed = understand(entry.text, { now });
  const { input } = toCreateInput(parsed, { today });
  if (!input) return null;
  const kind = KIND[entry.kind] || KIND.task;
  // The handwritten mark wins, except that a plain task line may still open
  // with one of TodoGeek's typed signifiers ("* @ dentist" is an event).
  input.signifier = entry.kind === 'task' && parsed.signifier && parsed.signifier !== '*' ? parsed.signifier : kind.signifier;
  if (kind.status) input.status = kind.status;
  // Tags the page itself gives every task (a 1:1's person), after the line's own.
  if (tags.length) input.tags = [...new Set([...(input.tags || []), ...tags])];
  if (sketch?.id) {
    const where = `From sketch: ${String(sketch.title || '').trim() || 'Untitled sketch'} — ${origin}/notes/${sketch.id}`;
    input.note = input.note ? `${input.note}\n${where}` : where;
  }
  return input;
}

/** "Due today", "Due Fri 20 Nov at 2:00 PM", priority, tags — one quiet line. */
export function summarize(text, { now = new Date() } = {}) {
  // Undated lines say "Due today" whatever `now` is: they land on today.
  const p = understand(text, { now });
  if (!p.content) return 'No words left for the task itself';
  const parts = [];
  if (p.dueDate) {
    const d = new Date(p.dueDate);
    const day = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    const time = p.hasTime ? ` at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : '';
    parts.push(`Due ${day}${time}`);
  } else {
    parts.push('Due today');
  }
  if (p.priority) parts.push(`${{ 1: 'High', 2: 'Medium', 3: 'Low' }[p.priority]} priority`);
  if (p.tags?.length) parts.push(p.tags.map((t) => `#${t}`).join(' '));
  if (p.recurrenceRule) parts.push('Repeats');
  if (p.private) parts.push('Private');
  if (p.blocked) parts.push('Blocked');
  return parts.join(' · ');
}

// ── "Already sent", loosely (review 1.11) ─────────────────────────────────
//
// A line's exact key changes with every letter, so a corrected word ("Bbo" →
// "Bob") or a fresh reading of the same ink made a sent line look new, and it
// came back TICKED. Each sent line is now remembered twice: its exact key, and
// a loose one — `~` and the words, lower-cased, without punctuation or [?].
// A row whose exact key was sent is "Already sent"; one whose words are close
// to a sent line's is "Probably already sent". Both arrive unticked.

const LOOSE_PREFIX = '~';
const LOOSE_MAX = 78; // the gateway takes keys up to 80 characters

/** The words of a line, for a loose comparison. */
export function looseText(text) {
  return String(text ?? '')
    .replace(/\[\?\]/g, ' ')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .slice(0, LOOSE_MAX);
}

export const looseKey = (text) => `${LOOSE_PREFIX}${looseText(text)}`;

/** Every key to remember for a row that was sent: as read, and as sent. */
export function sentKeysFor(row) {
  const keys = [row.key, looseKey(row.text)];
  if (row.original && row.original !== row.text) keys.push(looseKey(row.original));
  return [...new Set(keys.filter((k) => k && k !== LOOSE_PREFIX))];
}

function editDistance(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Close enough to be the same line read twice (or corrected once). */
export function looselySame(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const longer = Math.max(a.length, b.length);
  if (Math.min(a.length, b.length) < 6) return false;
  return 1 - editDistance(a, b) / longer >= 0.8;
}

/**
 * The Send dialog's rows for a transcript: each journal line, with `sent`
 * (this exact line went before), `probablySent` (words close to one that did)
 * and `on` (ticked) — open kinds only, and never one that went before.
 */
export function sendTaskRows(transcript, sentKeys = []) {
  const keys = new Set(sentKeys);
  const loose = sentKeys.filter((k) => k.startsWith(LOOSE_PREFIX)).map((k) => k.slice(LOOSE_PREFIX.length));
  return journalLines(transcript).map((e) => {
    const sent = keys.has(e.key);
    const mine = looseText(e.text);
    const probablySent = !sent && loose.some((l) => looselySame(mine, l));
    return { ...e, sent, probablySent, on: e.defaultOn && !sent && !probablySent };
  });
}

/**
 * The words the writer changed in the Send dialog, as corrections the page can
 * save to the sketch's transcript: `[{ line, from, to }]`.
 */
export function rowEdits(rows = []) {
  return rows
    .filter((r) => typeof r.original === 'string' && r.text.trim() && r.text.trim() !== r.original.trim())
    .map((r) => ({ line: r.line, from: r.original, to: r.text.trim() }));
}

/**
 * The transcript with those corrections made in place, or null when none of
 * them applies (the line moved or no longer holds the words).
 */
export function applyLineEdits(transcript, edits = []) {
  const lines = String(transcript ?? '').replace(/\r\n?/g, '\n').split('\n');
  let changed = false;
  for (const { line, from, to } of edits) {
    const at = lines[line];
    if (typeof at !== 'string' || !from || at.lastIndexOf(from) === -1) continue;
    const i = at.lastIndexOf(from);
    lines[line] = at.slice(0, i) + to + at.slice(i + from.length);
    changed = true;
  }
  return changed ? lines.join('\n') : null;
}

// ── The day the page was written (review 2.10, decision D6) ───────────────

const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * When the page was read on an EARLIER day than today, its relative dates
 * ("tomorrow", "/friday") mean that day's tomorrow. Returns the anchor and the
 * line the dialog shows, or null when the page is from today (or undated).
 */
export function writtenAnchor(writtenAt, { today = new Date() } = {}) {
  if (!writtenAt) return null;
  const at = new Date(writtenAt);
  if (Number.isNaN(at.getTime())) return null;
  if (dayStart(at) >= dayStart(today)) return null;
  const day = at.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/,/g, '');
  return { anchor: at, label: `Written ${day} · dates read from then` };
}
