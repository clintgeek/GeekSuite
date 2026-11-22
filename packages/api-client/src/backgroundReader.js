/**
 * backgroundReader.js — sketches nobody has open get read too
 * (apps/notegeek/DOCS/AUTO_TRANSCRIBE_SPEC.md, "Background reader",
 * 2026-11-22). Shared: NoteGeek and GeekDay both run it, each drawing the
 * page with its own editor (`render`).
 *
 * Only a browser can draw a sketch's page, and until now only the browser
 * that had the sketch OPEN read it, 90 s after the last stroke. Leave sooner,
 * or close the tablet at the end of a meeting, and the page was not
 * searchable until somebody opened it again. A page written in GeekDay was
 * never read at all.
 *
 * Now, while NoteGeek or GeekDay is open on any device:
 *   - it asks the gateway which sketches are waiting (`sketchesToTranscribe`:
 *     unread, and unchanged for 90 s), draws each one off-screen with the
 *     same exporter the open sketch uses, and sends it;
 *   - a sketch that was just closed is read a few seconds later, without
 *     waiting out the 90 s (`nudge`).
 *
 * WHETHER a page is read is still the gateway's decision (the setting, the
 * daily cap, one request per sketch, photo and locked notes never). This only
 * decides when to ask. Nothing here throws, and nothing here touches saving.
 */
import { gql } from '@apollo/client';

/** Sketches that are waiting to be read and that nobody is writing on. */
export const SKETCHES_TO_TRANSCRIBE = gql`
    query SketchesToTranscribe($limit: Int) {
        sketchesToTranscribe(limit: $limit)
    }
`;

/**
 * One sketch's drawing, to read. Fetched with `no-cache`: megabytes that are
 * needed once must not sit in the Apollo cache.
 */
export const SKETCH_TO_READ = gql`
    query SketchToRead($id: ID!) {
        note(id: $id) {
            id
            type
            content
        }
    }
`;

/** Does a sketch that was just closed still need reading? */
export const SKETCH_READ_STATE = gql`
    query SketchReadState($noteId: ID!) {
        sketchTranscript(noteId: $noteId) {
            status
            autoEnabled
        }
    }
`;

/**
 * The read itself. `background: true`: a page nobody has open stops at 20 of
 * the day's reads, so a backlog never uses up the open page's.
 */
export const BACKGROUND_TRANSCRIBE_SKETCH = gql`
    mutation BackgroundTranscribeSketch($noteId: ID!, $image: String!, $mediaType: String!) {
        autoTranscribeSketch(noteId: $noteId, image: $image, mediaType: $mediaType, background: true) {
            status
            retryAt
        }
    }
`;

/** After the app opens, or comes back to the front. */
export const FIRST_PASS_MS = 15_000;
export const VISIBLE_PASS_MS = 5_000;
/** Nothing was waiting: look again this often while the app is open. */
export const IDLE_PASS_MS = 2 * 60_000;
/** A full batch was read: there is probably more. */
export const NEXT_BATCH_MS = 4_000;
/** After a sketch is closed: long enough for its last save to land. */
export const AFTER_CLOSE_MS = 6_000;
/** Sketches per pass. */
export const BATCH = 3;
/** The gateway's own ceiling on `limit`. */
const MAX_LIMIT = 10;

// ── which sketch is open, and which was just closed ────────────────────────
// Module state, so the editor page and the reader (mounted in the shell) need
// no shared provider.
let openSketchId = null;
const closeListeners = new Set();

/** The editor page says which sketch it has open (null: none). */
export function setOpenSketch(id) {
  openSketchId = id || null;
}
export const getOpenSketch = () => openSketchId;

/** The editor page closed this sketch: read it soon if it still needs it. */
export function sketchClosed(id) {
  if (!id) return;
  if (openSketchId === id) openSketchId = null;
  closeListeners.forEach((fn) => fn(id));
}

/**
 * @param {object} o
 * @param {object} o.client  an Apollo client (`query`, `mutate`)
 * @param {(content: string) => Promise<{base64: string, mediaType: string}|null>} o.render
 *        draw a saved sketch as the image a model reads; null when there is
 *        no ink on it
 * @param {Document} [o.doc]
 * @param {Navigator} [o.nav]
 * @returns {{ start: () => void, stop: () => void, pass: () => Promise<string[]> }}
 */
export function createBackgroundReader({ client, render, doc = globalThis.document, nav = globalThis.navigator }) {
  let timer = null;
  let dueAt = 0;
  let running = false;
  let stopped = true;
  /** Just closed: read without waiting for the 90 s. */
  const closed = [];
  /** Could not be read this session: not asked for again until a reload. */
  const skip = new Set();

  const away = () => doc?.visibilityState === 'hidden' || nav?.onLine === false;

  /** One timer; an earlier request wins over a later one. */
  function schedule(ms, { force = false } = {}) {
    if (stopped) return;
    const at = Date.now() + ms;
    if (timer && !force && dueAt <= at) return;
    if (timer) clearTimeout(timer);
    dueAt = at;
    timer = setTimeout(() => {
      timer = null;
      pass();
    }, ms);
  }

  /** Draw one sketch and send it. Returns the status the gateway gave, or why nothing was sent. */
  async function readOne(id) {
    const { data } = await client.query({ query: SKETCH_TO_READ, variables: { id }, fetchPolicy: 'no-cache' });
    const note = data?.note;
    if (!note || note.type !== 'handwritten' || !note.content) return 'gone';
    let page;
    try {
      page = await render(note.content);
    } catch {
      // This page cannot be drawn (too big to send, or the canvas failed):
      // that says nothing about the next one.
      return 'unreadable';
    }
    if (!page) return 'empty';
    // Opened while it was being drawn: the open sketch reads itself.
    if (getOpenSketch() === id) return 'open';
    const { data: res } = await client.mutate({
      mutation: BACKGROUND_TRANSCRIBE_SKETCH,
      variables: { noteId: id, image: page.base64, mediaType: page.mediaType },
    });
    return res?.autoTranscribeSketch?.status || 'unknown';
  }

  /** Does a just-closed sketch still need reading? The gateway says. */
  async function stillWaiting(id) {
    const { data } = await client.query({ query: SKETCH_READ_STATE, variables: { noteId: id }, fetchPolicy: 'network-only' });
    const view = data?.sketchTranscript;
    return Boolean(view && view.autoEnabled !== false && view.status === 'waiting');
  }

  /** One pass. Resolves with what happened to each sketch it looked at (for tests). */
  async function pass() {
    if (stopped || running) return [];
    if (away()) return []; // `visibilitychange` and `online` start the next one
    running = true;
    const outcomes = [];
    let next = IDLE_PASS_MS;
    try {
      let ids = [...new Set(closed.splice(0))];
      const fromClose = ids.length > 0;
      let listed = 0;
      if (!fromClose) {
        // Ask for enough to get past the ones this session gave up on.
        const limit = Math.min(MAX_LIMIT, BATCH + skip.size);
        const { data } = await client.query({ query: SKETCHES_TO_TRANSCRIBE, variables: { limit }, fetchPolicy: 'network-only' });
        ids = data?.sketchesToTranscribe || [];
        listed = ids.length;
      }
      let read = 0;
      for (const id of ids) {
        if (stopped || away()) break;
        if (skip.has(id) || getOpenSketch() === id) continue;
        let outcome;
        try {
          // eslint-disable-next-line no-await-in-loop
          outcome = fromClose && !(await stillWaiting(id)) ? 'settled' : await readOne(id);
        } catch {
          outcome = 'error';
        }
        outcomes.push(`${id}:${outcome}`);
        if (outcome === 'searchable') read += 1;
        else if (outcome !== 'settled' && outcome !== 'open' && outcome !== 'transcribing') skip.add(id);
        // The day's cap, an outage, or the gateway unreachable: no point
        // drawing the next one now.
        if (outcome === 'retry' || outcome === 'error') break;
      }
      // After a closed sketch, look at the list soon: there may be others.
      if (fromClose) next = NEXT_BATCH_MS;
      else if (listed >= BATCH && read > 0) next = NEXT_BATCH_MS;
    } catch {
      // The gateway could not be asked (offline, or one that predates the
      // query): try again at the idle pace.
    } finally {
      running = false;
      schedule(closed.length ? AFTER_CLOSE_MS : next);
    }
    return outcomes;
  }

  const onVisible = () => {
    if (!away()) schedule(VISIBLE_PASS_MS);
  };
  const onClosed = (id) => {
    skip.delete(id); // it may have new ink since it was given up on
    closed.push(id);
    schedule(AFTER_CLOSE_MS);
  };

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      doc?.addEventListener?.('visibilitychange', onVisible);
      globalThis.addEventListener?.('online', onVisible);
      closeListeners.add(onClosed);
      schedule(FIRST_PASS_MS);
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      doc?.removeEventListener?.('visibilitychange', onVisible);
      globalThis.removeEventListener?.('online', onVisible);
      closeListeners.delete(onClosed);
    },
    pass,
  };
}
