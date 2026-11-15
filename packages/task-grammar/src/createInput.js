/**
 * createInput.js — from a parsed task line to TodoGeek's createTask input.
 *
 * Moved here from TodoGeek's `utils/quickAdd.js` on 2026-11-14 (unchanged),
 * so every surface that turns a line into a task sends the same thing. The
 * rules, as TodoGeek's add box has them:
 *
 * - **No date → today, date-only.** A date without a time is date-only
 *   (`yyyy-MM-dd`); a typed time is sent as the instant.
 * - **Repeating entries** anchor their RRULE on the parsed 09:00 instant.
 * - A timed value is never exactly UTC midnight (`avoidUtcMidnight`), and
 *   with `{ explicit: true }` the input also says `hasDueTime` (contract C2)
 *   and, for a repeat, the browser's `timeZone`.
 * - **`~blocked` is a `#blocked` tag**, with any reason kept in the note.
 * - `$^note` goes to NoteGeek and is NOT part of the task input.
 * - `(private)` sends `private: true`, and only when true.
 */
import { localDateString } from '@geeksuite/utils';
import { buildRecurrenceRule, frequencyFromRecurrenceRule } from './parseTaskInput.js';

/**
 * A timed instant that is never EXACTLY UTC midnight.
 *
 * Until contract C2 (2026-11-15) "date only" was encoded as UTC midnight, and
 * 6 pm US-Central (7 pm in summer) is UTC midnight — so a task timed then was
 * read as a date-only task for the next day. The input now says `hasDueTime`
 * out loud; this is the belt and braces for any reader that still uses the
 * old rule (a gateway mid-deploy, an old tab): one second later is the same
 * minute to every clock in the UI, and no longer midnight.
 */
export function avoidUtcMidnight(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return d;
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) {
    return new Date(d.getTime() + 1000);
  }
  return d;
}

/** The browser's IANA zone, or null where Intl cannot say. */
export function localTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/**
 * @param {object} parsed  a `parseTaskInput` result
 * @param {{ today?: Date }} [options]
 * @returns {{ input: object|null, noteGeekNote: string|null }}
 *   `input` is null when there is nothing to add (no words left).
 */
export function toCreateInput(parsed, { today = new Date(), explicit = false, timeZone = localTimeZone() } = {}) {
  if (!parsed?.content) return { input: null, noteGeekNote: null };

  const tags = [...(parsed.tags || [])];
  if (parsed.blocked && !tags.some((t) => t.toLowerCase() === 'blocked')) tags.push('blocked');

  const noteParts = [parsed.note, parsed.blockedReason ? `Blocked: ${parsed.blockedReason}` : null].filter(Boolean);

  let dueDate;
  let hasDueTime;
  let recurrenceRule = parsed.recurrenceRule || null;
  if (recurrenceRule) {
    // Repeats keep the 09:00 anchor (the RRULE's DTSTART), which every
    // reader has always treated as a time.
    const anchor = parsed.dueDate ? new Date(parsed.dueDate) : new Date(today);
    if (!parsed.dueDate) anchor.setHours(9, 0, 0, 0);
    dueDate = avoidUtcMidnight(anchor);
    hasDueTime = true;
    if (dueDate.getTime() !== anchor.getTime()) {
      recurrenceRule = buildRecurrenceRule(frequencyFromRecurrenceRule(recurrenceRule), dueDate) || recurrenceRule;
    }
  } else if (parsed.dueDate) {
    hasDueTime = Boolean(parsed.hasTime);
    dueDate = hasDueTime ? avoidUtcMidnight(parsed.dueDate) : localDateString(parsed.dueDate);
  } else {
    dueDate = localDateString(today);
    hasDueTime = false;
  }

  const input = {
    content: parsed.content,
    signifier: parsed.signifier || '*',
    dueDate,
  };
  // Contract C2: say whether dueDate carries a time, rather than leave the
  // gateway to guess from UTC midnight. Opt-in, so a caller whose mutation
  // does not declare `$hasDueTime` keeps exactly the input it had (the
  // nudge off UTC midnight above already makes the legacy rule right).
  // TodoGeek's TaskContext adds the flag itself from the value's shape.
  if (explicit) input.hasDueTime = hasDueTime;
  if (parsed.priority) input.priority = parsed.priority;
  if (tags.length) input.tags = tags;
  if (noteParts.length) input.note = noteParts.join('\n');
  if (recurrenceRule) {
    input.recurrenceRule = recurrenceRule;
    // The zone keeps a repeat at the same clock time across DST (opt-in too).
    if (explicit && timeZone) input.timeZone = timeZone;
  }
  if (parsed.private) input.private = true;

  return { input, noteGeekNote: parsed.noteGeekNote || null };
}
