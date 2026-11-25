/**
 * The notes opened on this device, newest first: what the reference picker
 * offers before anything is typed (DOCS/REFERENCE_PANE_SPEC.md req 5).
 *
 * On the device only. Opening a note is not an edit and the server is never
 * told about it; a title here can be a little stale, and the picker opens the
 * note by id.
 */
export const RECENT_NOTES_KEY = 'notegeek.recentNotes';
export const RECENT_NOTES_MAX = 12;

const storageOf = (storage) => {
  if (storage) return storage;
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

/** `[{ id, title, type, at }]`, newest first. Never throws. */
export function recentlyOpened({ storage } = {}) {
  try {
    const list = JSON.parse(storageOf(storage)?.getItem(RECENT_NOTES_KEY) || '[]');
    return Array.isArray(list) ? list.filter((n) => n && typeof n.id === 'string') : [];
  } catch {
    return [];
  }
}

/** A note was opened: it moves to the front. */
export function rememberOpened(note, { storage, now = Date.now() } = {}) {
  const id = note?.id;
  if (!id || id === 'new' || id === 'undefined') return;
  const entry = { id: String(id), title: String(note.title || '').slice(0, 200), type: note.type || null, at: now };
  const rest = recentlyOpened({ storage }).filter((n) => n.id !== entry.id);
  try {
    storageOf(storage)?.setItem(RECENT_NOTES_KEY, JSON.stringify([entry, ...rest].slice(0, RECENT_NOTES_MAX)));
  } catch {
    // Private mode or a full disk: the picker falls back to recently edited notes.
  }
}

/** A deleted note should not be offered. */
export function forgetOpened(id, { storage } = {}) {
  try {
    const rest = recentlyOpened({ storage }).filter((n) => n.id !== id);
    storageOf(storage)?.setItem(RECENT_NOTES_KEY, JSON.stringify(rest));
  } catch {
    // Nothing to do.
  }
}
