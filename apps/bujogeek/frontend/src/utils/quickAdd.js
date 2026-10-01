/**
 * quickAdd.js — from one typed line to a createTask call, and to the words a
 * screen reader hears about what the line was understood to mean.
 *
 * The parser (`parseTaskInput.js`) reads the grammar; this file decides what
 * the add box sends:
 *
 * - **No date typed → today, date-only.** The add box sits on Today; an entry
 *   typed there belongs to today. It used to be sent as today at 09:00 local,
 *   which the gateway reads as a due TIME (anything but UTC midnight is one),
 *   so every quick-added task carried a phantom "9:00" and was eligible for a
 *   9am push reminder nobody asked for.
 * - **A date without a time → date-only** (`yyyy-MM-dd`, stored as UTC
 *   midnight), for the same reason. A typed time (`/friday 2pm`,
 *   `tomorrow 2pm`) is sent as the instant.
 * - **Repeating entries are left exactly as before** — the RRULE's DTSTART is
 *   anchored on the parsed 09:00 instant, and the first occurrence has to
 *   agree with it. Repeats are Phase 2.
 * - **`~blocked` is a `#blocked` tag.** The parked state has no screen any
 *   more (SIMPLE_PLAN "Out of the UI"), so the token still parses but files
 *   the entry as an ordinary task tagged `blocked`, with any reason kept in
 *   its note as "Blocked: …".
 * - `$^note` goes to NoteGeek and is NOT part of the task input.
 * - `(private)` sends `private: true`. It is only ever sent when true, so a
 *   gateway that predates the field never sees it from an ordinary entry.
 */
import { format } from 'date-fns';
import { localDateString } from '@geeksuite/utils';

const PRIORITY_WORD = { 1: 'high', 2: 'medium', 3: 'low' };
const KIND_WORD = { '@': 'event', '-': 'note', '?': 'question', '!': 'important' };

/**
 * @param {object} parsed  a `parseTaskInput` result
 * @param {{ today?: Date }} [options]
 * @returns {{ input: object|null, noteGeekNote: string|null }}
 *   `input` is null when there is nothing to add (no words left).
 */
export function toCreateInput(parsed, { today = new Date() } = {}) {
  if (!parsed?.content) return { input: null, noteGeekNote: null };

  const tags = [...(parsed.tags || [])];
  if (parsed.blocked && !tags.some((t) => t.toLowerCase() === 'blocked')) tags.push('blocked');

  const noteParts = [parsed.note, parsed.blockedReason ? `Blocked: ${parsed.blockedReason}` : null].filter(Boolean);

  let dueDate;
  if (parsed.recurrenceRule) {
    const anchor = parsed.dueDate ? new Date(parsed.dueDate) : new Date(today);
    if (!parsed.dueDate) anchor.setHours(9, 0, 0, 0);
    dueDate = anchor;
  } else if (parsed.dueDate) {
    dueDate = parsed.hasTime ? new Date(parsed.dueDate) : localDateString(parsed.dueDate);
  } else {
    dueDate = localDateString(today);
  }

  const input = {
    content: parsed.content,
    signifier: parsed.signifier || '*',
    dueDate,
  };
  if (parsed.priority) input.priority = parsed.priority;
  if (tags.length) input.tags = tags;
  if (noteParts.length) input.note = noteParts.join('\n');
  if (parsed.recurrenceRule) input.recurrenceRule = parsed.recurrenceRule;
  if (parsed.private) input.private = true;

  return { input, noteGeekNote: parsed.noteGeekNote || null };
}

/** "today", "tomorrow", "Friday 3 October", with ", at 2pm" when timed. */
export function spokenDate(parsed, now = new Date()) {
  if (!parsed?.dueDate) return '';
  const d = new Date(parsed.dueDate);
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((b - a) / 86400000);
  const day = diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : format(d, 'EEEE d MMMM');
  if (!parsed.hasTime) return day;
  const time = format(d, d.getMinutes() ? 'h:mm a' : 'h a').toLowerCase();
  return `${day} at ${time}`;
}

/**
 * What the add box understood, as one sentence for `aria-describedby`.
 * Empty input says how to use the box instead.
 */
export function describeParse(parsed, now = new Date()) {
  if (!parsed) return 'Type a task and press Enter.';
  if (!parsed.content) {
    return parsed.spans?.length ? 'Add some words for the task itself.' : 'Type a task and press Enter.';
  }
  const parts = [`Task: ${parsed.content}.`];
  const kind = KIND_WORD[parsed.signifier];
  if (kind) parts.push(`Marked as ${kind === 'important' ? 'important' : `a${kind === 'event' ? 'n' : ''} ${kind}`}.`);
  parts.push(parsed.dueDate ? `Due ${spokenDate(parsed, now)}.` : 'Due today.');
  if (parsed.priority) parts.push(`${PRIORITY_WORD[parsed.priority][0].toUpperCase()}${PRIORITY_WORD[parsed.priority].slice(1)} priority.`);
  const tags = [...(parsed.tags || []), ...(parsed.blocked ? ['blocked'] : [])];
  if (tags.length) parts.push(`Tagged ${tags.join(', ')}.`);
  if (parsed.recurrenceRule) parts.push('Repeats.');
  if (parsed.private) parts.push('Private: hidden on a desktop until you show it.');
  if (parsed.note) parts.push('With a note.');
  if (parsed.noteGeekNote) parts.push('Note saved to NoteGeek.');
  return parts.join(' ');
}

/**
 * The line with the `(private)` token added (at the end) or every copy of it
 * taken out — what the add box's Private tick box does, so the box and the
 * token are one thing: the line is the only state.
 */
export function setPrivateToken(text, on) {
  const line = String(text ?? '');
  const has = /\(private\)/i.test(line);
  if (on) {
    if (has) return line;
    const trimmed = line.replace(/\s+$/, '');
    return trimmed ? `${trimmed} (private)` : '(private) ';
  }
  if (!has) return line;
  return line.replace(/\s*\(private\)/gi, '').replace(/^\s+/, '').replace(/\s{2,}/g, ' ');
}

/** Split a line into plain and understood segments, in order. */
export function segmentLine(text, spans = []) {
  const out = [];
  let at = 0;
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    if (span.start < at) continue;
    if (span.start > at) out.push({ text: text.slice(at, span.start), kind: null });
    out.push({ text: text.slice(span.start, span.end), kind: span.kind });
    at = span.end;
  }
  if (at < text.length) out.push({ text: text.slice(at), kind: null });
  return out;
}
