/**
 * Words → a TodoGeek task. One path for the typed add box and for
 * circle-to-task, so both read text the same way (spec reqs 3, 9, 10).
 *
 * The reading itself is `@geeksuite/task-grammar`, the grammar TodoGeek's own
 * add box uses. Two things are GeekDay's:
 *
 *   1. The anchor. Text is read against the day ON SCREEN, so a task with no
 *      date lands on that page and "tomorrow" means the day after it.
 *   2. Weekday abbreviations. The shared grammar knows "friday" but not
 *      "fri", and handwriting abbreviates. An abbreviation near the start or
 *      end of the text is spelled out, and that reading is used only when it
 *      FINDS a date the plain reading did not. Three abbreviations are also
 *      English words ("sat", "sun", "wed"); those count as a day only beside
 *      a time ("sat 2pm") or after on / by / due / next / this, so "sat with
 *      mom" stays a sentence. Whatever is read, the add box and the confirm
 *      step show the date before anything is created.
 */
import { localTimeZone, parseTaskInputDetailed, toCreateInput } from '@geeksuite/task-grammar';
import { localDateString, utcDateString } from '@geeksuite/utils';
import { anchorFor, shortDay } from './days.js';

const WEEKDAYS = {
  mon: 'monday',
  tue: 'tuesday',
  tues: 'tuesday',
  wed: 'wednesday',
  weds: 'wednesday',
  thu: 'thursday',
  thur: 'thursday',
  thurs: 'thursday',
  fri: 'friday',
  sat: 'saturday',
  sun: 'sunday',
};
/** Abbreviations that are also ordinary words. */
const AMBIGUOUS = new Set(['sat', 'sun', 'wed']);
const TIME_WORD = /^(?:at|\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\d{1,2}(?:am|pm))$/i;
const DATE_LEAD = /^(?:on|by|due|next|this)$/i;

/** How far in from either end a plain-word date can sit ("call vet on fri at 2pm"). */
const EDGE_WORDS = 4;

/** Spell out weekday abbreviations near the start or end. Null when there are none. */
export function expandWeekdays(text) {
  const parts = String(text || '').split(/(\s+)/); // keep the spacing
  const at = parts.map((w, i) => (/\S/.test(w) ? i : -1)).filter((i) => i >= 0);
  const word = (n) => (n >= 0 && n < at.length ? parts[at[n]] : '');
  let changed = false;
  at.forEach((index, n) => {
    if (n >= EDGE_WORDS && n < at.length - EDGE_WORDS) return;
    const m = /^([A-Za-z]+)([.,]?)$/.exec(parts[index]);
    const key = m?.[1].toLowerCase();
    const full = key && WEEKDAYS[key];
    if (!full) return;
    if (AMBIGUOUS.has(key) && !TIME_WORD.test(word(n + 1)) && !TIME_WORD.test(word(n - 1)) && !DATE_LEAD.test(word(n - 1))) return;
    parts[index] = full;
    changed = true;
  });
  return changed ? parts.join('') : null;
}

function parse(text, anchor) {
  const plain = parseTaskInputDetailed(text, { now: anchor });
  if (plain.dueDate) return plain;
  const expanded = expandWeekdays(text);
  if (!expanded) return plain;
  const again = parseTaskInputDetailed(expanded, { now: anchor });
  return again.dueDate ? again : plain;
}

/**
 * Read `text` as a task for the page `dayKey`.
 *
 * @returns {{ input: object|null, dayKey: string, timed: boolean }}
 *   `input` is the `createTask` variables (null when no words are left);
 *   `dayKey` is the local day the task will be due.
 */
export function readTask(text, dayKey, now = new Date()) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return { input: null, dayKey, timed: false };
  const anchor = anchorFor(dayKey, now);
  const parsed = parse(trimmed, anchor);
  const { input } = toCreateInput(parsed, { today: anchor, explicit: true, timeZone: localTimeZone() });
  if (!input) return { input: null, dayKey, timed: false };

  const timed = Boolean(input.hasDueTime);
  // A timed due date is an instant (a Date or its ISO string); send the string.
  const dueDate = input.dueDate instanceof Date ? input.dueDate.toISOString() : input.dueDate;
  const dueKey = timed ? localDateString(dueDate) : typeof dueDate === 'string' && dueDate.length === 10 ? dueDate : utcDateString(dueDate);
  return { input: { ...input, dueDate }, dayKey: dueKey || dayKey, timed };
}

const PRIORITY = { 1: 'High priority', 2: 'Medium priority', 3: 'Low priority' };

/**
 * What a reading means, as short parts the confirm step shows:
 * ["Fri, Nov 27", "2:00 PM", "High priority", "#home", "Repeats"].
 */
export function describeReading(reading, now = new Date(), locale) {
  const { input, dayKey, timed } = reading;
  if (!input) return [];
  const parts = [shortDay(dayKey, now, locale)];
  if (timed) parts.push(new Date(input.dueDate).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }));
  if (input.priority && PRIORITY[input.priority]) parts.push(PRIORITY[input.priority]);
  for (const tag of input.tags || []) parts.push(`#${tag}`);
  if (input.recurrenceRule) parts.push('Repeats');
  if (input.private) parts.push('Private');
  return parts;
}

/** Lines the transcriber writes for things that are not words. */
const NOT_WRITING = /^\[(no writing|drawing:[^\]]*)\]$/i;
/** A list mark at the start of a handwritten line: a bullet, not part of the task. */
const LIST_MARK = /^(?:[*\-•o]\s+|\[[ xX]?\]\s*)/;

/**
 * A transcript of circled handwriting → one line of task text. Several
 * circled lines become one task; the confirm step is where the user fixes it.
 * '' when there was no writing to read.
 */
export function transcriptToText(transcript) {
  return String(transcript || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !NOT_WRITING.test(line))
    .map((line) => line.replace(LIST_MARK, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A fresh idempotency key: one per typed line or circled crop, reused on retry. */
export function newClientId() {
  if (globalThis.crypto?.randomUUID) return `gd:${globalThis.crypto.randomUUID()}`;
  return `gd:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
