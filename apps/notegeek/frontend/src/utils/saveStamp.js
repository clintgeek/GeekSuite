import { formatRelativeTime } from './dateUtils';

/**
 * What the editor's save status says, as a pure function of the page's save
 * state — so the priority order is tested, not eyeballed.
 *
 * Graphite splits the states into QUIET and LOUD. Quiet ones are small,
 * lowercase, neutral metadata under the title ("saved · 3m ago"); loud ones
 * take the header's prime spot in the error colour, with a retry.
 *
 * Priority, highest first:
 *   1. saving   — a request is in flight                  → "saving…"        quiet
 *   2. offline  — no network AND something is unsaved     → "offline · not saved"  LOUD
 *   3. error    — the last attempt failed                 → "not saved"      LOUD
 *                 (sticks until a save succeeds: typing more does not make a
 *                 failed save look fine — that is how "a note that could not
 *                 be saved looked exactly like one that had been" happened
 *                 before, see NoteEditorPage.jsx)
 *   4. empty    — the last attempt had nothing in it      → "nothing to save" quiet
 *   5. dirty    — edits the 2s autosave has not written   → "editing"        quiet
 *   6. saved    — we know when it was last written        → "saved · 3m ago" quiet
 *   7. draft    — a new note nobody has typed into        → "draft"          quiet
 *
 * Offline with nothing unsaved is not news: the note on screen is the note
 * on the server, so the status stays "saved".
 *
 * @returns {{ tone: 'saving'|'offline'|'error'|'empty'|'dirty'|'saved'|'draft', label: string, loud: boolean }}
 */
export function saveStampState({
  saving = false,
  error = null,
  empty = false,
  dirty = false,
  offline = false,
  lastSavedAt = null,
  now,
} = {}) {
  const quiet = (tone, label) => ({ tone, label, loud: false });
  if (saving) return quiet('saving', 'saving…');
  if (offline && (dirty || error)) return { tone: 'offline', label: 'offline · not saved', loud: true };
  if (error) return { tone: 'error', label: 'not saved', loud: true };
  if (empty) return quiet('empty', 'nothing to save');
  if (dirty) return quiet('dirty', 'editing');
  if (lastSavedAt) return quiet('saved', `saved · ${formatRelativeTime(lastSavedAt, now)}`);
  return quiet('draft', 'draft');
}
