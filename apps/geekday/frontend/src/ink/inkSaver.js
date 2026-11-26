/**
 * inkSaver.js — when the page's ink is serialised and handed to the parent.
 *
 * The saving rules of NoteGeek's HandwrittenEditor.jsx, lifted out of the
 * component so they can be tested without tldraw:
 *
 *   - An edit only marks the page dirty. The snapshot is serialised ONCE, when
 *     the debounce fires or `flush()` is called — never inside a pointer event.
 *   - What was emitted is remembered (the last few). When one of those comes
 *     back as the `content` prop it is an echo of our own save, never a reason
 *     to reload: reloading one wiped the first stroke of the next word.
 *   - A load is not an edit: `loaded()` records the body, drops anything
 *     pending, and forgets the earlier saves (they belong to the page that
 *     was replaced).
 *   - A page that failed to load is never written: `failed()` blocks every
 *     save until a later `loaded()`. The canvas then shows a blank page over a
 *     note that still holds the real one, and saving that blank page (plus the
 *     next stroke) would replace it. This holds whatever the screen shows.
 */
export const SAVE_DEBOUNCE_MS = 400;
export const ECHOES_KEPT = 3;

/**
 * @param {object} deps
 * @param {() => string} deps.serialize  the page as a string, right now
 * @param {(content: string) => void} deps.emit  hand a new body to the parent
 */
export function createInkSaver({ serialize, emit, debounceMs = SAVE_DEBOUNCE_MS, echoesKept = ECHOES_KEPT }) {
  let dirty = false;
  let timer = null;
  let lastKnown = '';
  let emitted = [];
  let blocked = false;

  const cancelTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  /** Serialise now if anything is pending. Returns the body emitted, or null. */
  const flush = () => {
    cancelTimer();
    if (!dirty) return null;
    dirty = false;
    if (blocked) return null;
    let serialized;
    try {
      serialized = serialize();
    } catch (error) {
      console.warn('InkCanvas - could not serialise the page.', error);
      return null;
    }
    if (typeof serialized !== 'string' || serialized === lastKnown) return null;
    lastKnown = serialized;
    emitted = [serialized, ...emitted].slice(0, echoesKept);
    emit(serialized);
    return serialized;
  };

  return {
    /** The user changed the ink: save after the debounce. */
    markDirty() {
      if (blocked) return;
      dirty = true;
      cancelTimer();
      timer = setTimeout(() => {
        timer = null;
        flush();
      }, debounceMs);
    },
    flush,
    /** Is this `content` what the canvas already shows, or one of our own recent saves? */
    isOwn(content) {
      const body = content || '';
      return body === lastKnown || (body !== '' && emitted.includes(body));
    },
    /** `content` was just loaded into the canvas: nothing is pending any more. */
    loaded(content) {
      cancelTimer();
      dirty = false;
      blocked = false;
      lastKnown = content || '';
      // Saves made before a load are no longer echoes. Day A's last save,
      // handed back after day B was shown, is day A being opened again and
      // must load (found in the browser check: the page kept showing day B).
      emitted = [];
    },
    /** `content` could not be put on the canvas: nothing is saved until a page loads. */
    failed(content) {
      cancelTimer();
      dirty = false;
      blocked = true;
      lastKnown = content || '';
      emitted = [];
    },
    /** Did the last load fail (so nothing may be saved)? */
    isBlocked: () => blocked,
    hasPending: () => dirty,
    /** Has this page ever had a body (loaded with one, or saved one)? */
    hasBody: () => lastKnown !== '',
    dispose: cancelTimer,
  };
}
