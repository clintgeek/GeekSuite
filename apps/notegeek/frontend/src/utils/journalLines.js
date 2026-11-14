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

const CHECKBOX = /^(?:[-*•]\s+)?\[( |x|X|✓|✔)?\]\s+(?=\S)/;
const MARKS = [
  { kind: 'done', re: /^(?:x|X|×|✗|✘|✓|✔)\s+(?=\S)/ },
  { kind: 'task', re: /^(?:\*|•|·|∙|●)\s+(?=\S)/ },
  { kind: 'event', re: /^(?:o|O|○|◯|◦|@)\s+(?=\S)/ },
  { kind: 'note', re: /^(?:-|–|—)\s+(?=\S)/ },
  { kind: 'migrated', re: /^>\s+(?=\S)/ },
  { kind: 'scheduled', re: /^<\s+(?=\S)/ },
  { kind: 'important', re: /^!\s+(?=\S)/ },
  { kind: 'question', re: /^\?\s+(?=\S)/ },
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

/** What kind of journal line this is and its words, or null for prose. */
export function readMark(line) {
  const trimmed = String(line ?? '').trim();
  if (!trimmed) return null;
  const box = CHECKBOX.exec(trimmed);
  if (box) return { kind: box[1] && box[1] !== ' ' ? 'done' : 'task', text: trimmed.slice(box[0].length).trim() };
  for (const { kind, re } of MARKS) {
    const m = re.exec(trimmed);
    if (m) return { kind, text: trimmed.slice(m[0].length).trim() };
  }
  return null;
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
 * @param {{ kind: string, text: string }} entry
 * @param {{ now?: Date, sketch?: { id?: string, title?: string }, origin?: string }} [o]
 * @returns {object|null} null when there are no words left to make a task of
 */
export function taskInputFor(entry, { now = new Date(), sketch = null, origin = '' } = {}) {
  const parsed = understand(entry.text, { now });
  const { input } = toCreateInput(parsed, { today: now });
  if (!input) return null;
  const kind = KIND[entry.kind] || KIND.task;
  // The handwritten mark wins, except that a plain task line may still open
  // with one of TodoGeek's typed signifiers ("* @ dentist" is an event).
  input.signifier = entry.kind === 'task' && parsed.signifier && parsed.signifier !== '*' ? parsed.signifier : kind.signifier;
  if (kind.status) input.status = kind.status;
  if (sketch?.id) {
    const where = `From sketch: ${String(sketch.title || '').trim() || 'Untitled sketch'} — ${origin}/notes/${sketch.id}`;
    input.note = input.note ? `${input.note}\n${where}` : where;
  }
  return input;
}

/** "Due today", "Due Fri 20 Nov at 2:00 PM", priority, tags — one quiet line. */
export function summarize(text, { now = new Date() } = {}) {
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
