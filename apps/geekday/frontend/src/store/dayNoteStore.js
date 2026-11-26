/**
 * One day's ink page, as a NoteGeek note (spec reqs 6–8).
 *
 * A plain store rather than a hook, because a save must outlive the screen
 * that started it: flip to another day while a save is failing and the retry
 * keeps going; flip back and the unsaved ink is still what you see.
 *
 * The note
 *   - is an ordinary NoteGeek sketch (`type: "handwritten"`), tagged `daily`
 *     and `daily/<yyyy-MM-dd>`, titled with the date. Nothing GeekDay-only is
 *     stored on it (spec §4).
 *   - is found by the exact day tag — the gateway has no "note for a date".
 *   - is created on the FIRST ink, not on opening the day, so flipping through
 *     the calendar leaves no empty notes behind.
 *
 * Saving
 *   - one write in flight at a time; while it runs, only the newest ink waits.
 *   - `baseUpdatedAt` makes every update conditional: if the page changed on
 *     another device, nothing is overwritten and the user chooses.
 *   - a failed save is kept and retried (backoff, and at once when the
 *     network returns). Ink is never dropped while the app stays open.
 *
 * Loading
 *   - a failed fetch is 'loadError', never an empty day: an empty day would
 *     take ink and create or overwrite a note.
 *   - a page that was fetched but could not be drawn (the canvas calls
 *     `unreadable`) is 'unreadable': nothing is written to that note until a
 *     later load succeeds. The stored page stays exactly as it is.
 *
 * Known limit: `createNote` has no idempotency key, so two devices that both
 * put first ink on the same new day at the same moment each create a page.
 * The older one is the day's page from then on; the other stays in NoteGeek.
 */
import { CREATE_DAY_NOTE, FIND_DAY_NOTE, SAVE_DAY_NOTE } from '../graphql/documents.js';
import { dayTagFor, noteTagsFor, noteTitleFor } from '../lib/days.js';

/** The gateway's ceiling for a sketch body (notegeek validation SNAPSHOT_CONTENT_MAX). */
export const SKETCH_MAX_CHARS = 5_000_000;
/** Waits between retries of a failed save; the last one repeats. */
export const RETRY_DELAYS_MS = [3000, 10000, 30000, 60000];
/** A sketch save can be megabytes on a slow link. */
const SAVE_TIMEOUT_MS = 30000;
const LOAD_TIMEOUT_MS = 15000;

const conflictOf = (error) => {
  const hit = (error?.graphQLErrors || []).find((e) => e?.extensions?.code === 'CONFLICT');
  return hit ? hit.extensions.serverNote || {} : null;
};

/** The oldest live note wins when a day somehow has two. */
export function pickDayNote(notes) {
  return (
    (notes || [])
      .filter((note) => note && !note.deletedAt && !note.archived)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0] || null
  );
}

const INITIAL = {
  /** 'loading' | 'ready' | 'loadError' | 'unreadable' (fetched, but the canvas could not draw it) */
  phase: 'loading',
  /** The document to show. Changes with every write; see `revision`. */
  content: null,
  /** Bumps only when `content` came from the server, i.e. the canvas must reload it. */
  revision: 0,
  /** 'idle' | 'saving' | 'saved' | 'error' | 'conflict' | 'tooLarge' */
  save: 'idle',
  noteId: null,
};

export class DayNoteStore {
  constructor({
    client,
    dayKey,
    // Wrapped, not passed bare: a browser's setTimeout throws "Illegal invocation" when called as a method of another object.
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (timer) => clearTimeout(timer),
  }) {
    this.client = client;
    this.dayKey = dayKey;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.state = { ...INITIAL };
    this.listeners = new Set();
    this.updatedAt = null;
    this.pending = null; // newest ink not yet accepted by the server
    this.inFlight = false;
    this.attempt = 0;
    this.retryTimer = null;
    this.conflict = null; // { mine, server }
    this.loadSeq = 0;
  }

  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = () => this.state;

  set(patch) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  /** True while ink exists here that the server has not accepted. */
  hasUnsaved() {
    return this.pending !== null || this.inFlight || this.conflict !== null;
  }

  async load() {
    const seq = ++this.loadSeq;
    // Unsaved ink is newer than anything the server has: keep showing it.
    if (this.hasUnsaved()) return;
    if (this.state.phase !== 'ready') this.set({ phase: 'loading' });
    try {
      const { data } = await this.client.query({
        query: FIND_DAY_NOTE,
        variables: { tag: dayTagFor(this.dayKey) },
        fetchPolicy: 'no-cache',
        context: { timeoutMs: LOAD_TIMEOUT_MS },
      });
      if (seq !== this.loadSeq || this.hasUnsaved()) return;
      // No list is not "no note": it must never open as a blank day.
      if (!Array.isArray(data?.notes)) throw new Error('FindDayNote returned no notes list');
      const note = pickDayNote(data.notes);
      const content = note?.content || null;
      const changed = this.state.phase !== 'ready' || content !== this.state.content;
      this.updatedAt = note?.updatedAt || null;
      this.set({
        phase: 'ready',
        noteId: note?.id || null,
        content,
        revision: changed ? this.state.revision + 1 : this.state.revision,
      });
    } catch {
      if (seq !== this.loadSeq) return;
      // A page that is already on screen stays; only a first load can fail visibly.
      if (this.state.phase !== 'ready') this.set({ phase: 'loadError' });
    }
  }

  /**
   * The canvas could not draw `content` (bad JSON, a record tldraw refuses,
   * a failed migration). Nothing is written to this note until a later load
   * succeeds: what the canvas shows is not the note.
   */
  unreadable(content) {
    if (this.state.phase !== 'ready' || content !== this.state.content || this.hasUnsaved()) return;
    this.set({ phase: 'unreadable' });
  }

  /** New ink from the canvas: the whole serialised page. */
  write(content) {
    if (typeof content !== 'string' || !content || this.state.phase !== 'ready') return;
    if (content === this.state.content && !this.hasUnsaved()) return;
    this.pending = content;
    this.state = { ...this.state, content }; // silent: the canvas already shows it
    if (content.length > SKETCH_MAX_CHARS) {
      this.cancelRetry();
      this.set({ save: 'tooLarge' });
      return;
    }
    if (this.conflict) return; // the user is choosing; nothing is sent meanwhile
    this.attempt = 0;
    this.cancelRetry();
    this.pump();
  }

  async pump() {
    if (this.inFlight || this.pending === null || this.conflict) return;
    if (this.state.phase !== 'ready') return; // never over a page that did not load
    if (this.pending.length > SKETCH_MAX_CHARS) return;
    const content = this.pending;
    this.pending = null;
    this.inFlight = true;
    this.set({ save: 'saving' });
    try {
      if (this.state.noteId) {
        const { data } = await this.client.mutate({
          mutation: SAVE_DAY_NOTE,
          variables: { id: this.state.noteId, content, baseUpdatedAt: this.updatedAt },
          context: { timeoutMs: SAVE_TIMEOUT_MS },
        });
        this.updatedAt = data?.updateNote?.updatedAt || this.updatedAt;
      } else {
        const { data } = await this.client.mutate({
          mutation: CREATE_DAY_NOTE,
          variables: { title: noteTitleFor(this.dayKey), content, tags: noteTagsFor(this.dayKey) },
          context: { timeoutMs: SAVE_TIMEOUT_MS },
        });
        const created = data?.createNote;
        if (!created?.id) throw new Error('createNote returned no note');
        this.updatedAt = created.updatedAt || null;
        this.state = { ...this.state, noteId: created.id };
      }
      this.inFlight = false;
      this.attempt = 0;
      this.set({ save: this.pending === null ? 'saved' : 'saving' });
      this.pump();
    } catch (error) {
      this.inFlight = false;
      const server = conflictOf(error);
      if (server) {
        // Not written. Keep the newest ink as "mine" and let the user choose.
        this.conflict = { mine: this.pending ?? content, server };
        this.pending = null;
        this.set({ save: 'conflict' });
        return;
      }
      // Put the ink back unless newer ink arrived while this was in the air.
      if (this.pending === null) this.pending = content;
      this.set({ save: 'error' });
      this.scheduleRetry();
    }
  }

  scheduleRetry() {
    this.cancelRetry();
    const delay = RETRY_DELAYS_MS[Math.min(this.attempt, RETRY_DELAYS_MS.length - 1)];
    this.attempt += 1;
    this.retryTimer = this.setTimer(() => {
      this.retryTimer = null;
      this.pump();
    }, delay);
  }

  cancelRetry() {
    if (this.retryTimer !== null) this.clearTimer(this.retryTimer);
    this.retryTimer = null;
  }

  /** Try a failed save now (the Retry button, or the network coming back). */
  retryNow() {
    if (this.state.save !== 'error' && this.pending === null) return;
    this.cancelRetry();
    this.pump();
  }

  /**
   * Settle a conflict.
   *   'mine'   save this device's ink over the other device's version
   *   'theirs' drop this device's unsaved ink and show the other version
   */
  resolveConflict(which) {
    if (!this.conflict) return;
    const { mine, server } = this.conflict;
    this.conflict = null;
    this.updatedAt = server.updatedAt || this.updatedAt;
    if (which === 'theirs') {
      this.pending = null;
      this.set({ save: 'saved', content: server.content || null, revision: this.state.revision + 1 });
      return;
    }
    this.pending = this.pending ?? mine;
    this.attempt = 0;
    this.pump();
  }

  dispose() {
    this.cancelRetry();
    this.listeners.clear();
    this.loadSeq += 1;
  }
}

/** One store per day, shared by every mount of that day and kept while it has unsaved ink. */
const stores = new Map();

export function dayNoteStore(client, dayKey) {
  let store = stores.get(dayKey);
  if (!store || store.client !== client) {
    store?.dispose();
    store = new DayNoteStore({ client, dayKey });
    stores.set(dayKey, store);
    store.load();
  }
  return store;
}

/** Drop stores that are off screen and fully saved. */
export function releaseDayNoteStores(keepKey) {
  for (const [key, store] of stores) {
    if (key === keepKey || store.hasUnsaved() || store.listeners.size) continue;
    store.dispose();
    stores.delete(key);
  }
}

/** Every store with ink the server has not accepted (for retry-on-online and the leave warning). */
export const unsavedDayNoteStores = () => [...stores.values()].filter((store) => store.hasUnsaved());

/** Forget everything (sign-out, tests). */
export function resetDayNoteStores() {
  stores.forEach((store) => store.dispose());
  stores.clear();
}
