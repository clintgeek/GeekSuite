import { formatRelativeTime } from './dateUtils';

/**
 * What the editor's save stamp says, as a pure function of the page's save
 * state — so the priority order is tested, not eyeballed.
 *
 * Priority, highest first:
 *   1. saving   — a request is in flight            → "Saving…"
 *   2. error    — the last attempt failed           → "Not saved"
 *                 (sticks until a save succeeds: typing more does not
 *                 make a failed save look fine — that is how "a note that
 *                 could not be saved looked exactly like one that had been"
 *                 happened before, see NoteEditorPage.jsx)
 *   3. empty    — the last attempt had nothing in it → "Nothing to save"
 *   4. dirty    — edits the 2s autosave has not written yet → "Unsaved"
 *   5. saved    — we know when it was last written  → "Saved · 3m ago"
 *   6. draft    — a new note nobody has typed into  → "Draft"
 *
 * @returns {{ tone: 'saving'|'error'|'empty'|'dirty'|'saved'|'draft', label: string }}
 */
export function saveStampState({ saving = false, error = null, empty = false, dirty = false, lastSavedAt = null, now } = {}) {
  if (saving) return { tone: 'saving', label: 'Saving…' };
  if (error) return { tone: 'error', label: 'Not saved' };
  if (empty) return { tone: 'empty', label: 'Nothing to save' };
  if (dirty) return { tone: 'dirty', label: 'Unsaved' };
  if (lastSavedAt) {
    return { tone: 'saved', label: `Saved · ${formatRelativeTime(lastSavedAt, now)}` };
  }
  return { tone: 'draft', label: 'Draft' };
}
