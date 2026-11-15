/**
 * draftStore — the editor's unsaved work, on this device (review 2026-11, 1.2).
 *
 * Autosave waits two seconds after the last edit, and Android can freeze an
 * installed PWA sooner than that: switch to the camera, take a call, tap Back.
 * So the editor mirrors what is on screen here, keyed by note id (or a
 * `new:<history key>` for a note that has no id yet), and clears it when the
 * server acknowledges the save. A draft that is still here when the note is
 * opened again is work the server never got: the editor offers to restore it.
 *
 * Raw IndexedDB — no dependency — because a sketch is megabytes and
 * localStorage is ~5 MB for the whole origin and synchronous. Every call is
 * best effort: a browser without IndexedDB (private mode, a test runner)
 * falls back to memory, and nothing here ever throws into the editor.
 *
 * A draft: { key, noteId, title, content, tags, type, baseUpdatedAt, savedAt }
 * `savedAt` is this device's clock (ms); `baseUpdatedAt` the server version
 * the edit was made against, so restoring it still meets the conflict check.
 */

const DB_NAME = 'notegeek-drafts';
const STORE = 'drafts';
const VERSION = 1;

const memory = new Map();
let dbPromise = null;

function idb() {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB ? indexedDB : null;
  } catch {
    return null;
  }
}

function open() {
  const factory = idb();
  if (!factory) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let req;
    try {
      req = factory.open(DB_NAME, VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  }).then((db) => {
    if (!db) dbPromise = null; // try again next time rather than give up for the session
    return db;
  });
  return dbPromise;
}

function run(mode, fn) {
  return open().then((db) => {
    if (!db) return undefined;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req?.result);
        tx.onerror = () => resolve(undefined);
        tx.onabort = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });
  }).catch(() => undefined);
}

/** Keep `draft` under `key`. Resolves when written (or when it could not be). */
export async function saveDraft(key, draft) {
  if (!key) return;
  const record = { ...draft, key, savedAt: draft?.savedAt ?? Date.now() };
  memory.set(key, record);
  await run('readwrite', (store) => store.put(record));
}

/** The draft under `key`, or null. */
export async function getDraft(key) {
  if (!key) return null;
  const stored = await run('readonly', (store) => store.get(key));
  return stored || memory.get(key) || null;
}

/** Forget the draft under `key`. */
export async function clearDraft(key) {
  if (!key) return;
  memory.delete(key);
  await run('readwrite', (store) => store.delete(key));
}

/**
 * Forget `key` only if what it holds is still `content`/`title` — the save
 * that just landed wrote exactly this. A newer draft (typed during the round
 * trip) is left for the next save.
 */
export async function clearDraftIfSaved(key, { content, title }) {
  if (!key) return;
  const current = await getDraft(key);
  if (!current) return;
  if (current.content === content && (current.title || '') === (title || '')) {
    await clearDraft(key);
  }
}

/** The key a note's draft lives under. */
export const draftKeyFor = (noteId, newKey) => (noteId ? `note:${noteId}` : `new:${newKey || 'default'}`);

/** Tests only. */
export function __resetDraftsForTests() {
  memory.clear();
  dbPromise = null;
}
