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
 * - **`~blocked` is a `#blocked` tag**, with any reason kept in the note.
 * - `$^note` goes to NoteGeek and is NOT part of the task input.
 * - `(private)` sends `private: true`, and only when true.
 */
import { localDateString } from '@geeksuite/utils';

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
