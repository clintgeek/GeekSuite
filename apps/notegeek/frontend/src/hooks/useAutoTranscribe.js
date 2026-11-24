/**
 * useAutoTranscribe — the open sketch makes itself searchable
 * (DOCS/AUTO_TRANSCRIBE_SPEC.md, Option A).
 *
 * WHEN is decided here; WHETHER and the honest bookkeeping are the gateway's
 * (basegeek graphql/notegeek/sketchTranscript.js).
 *
 *   - Only ink edits count: `onInkEdit` is called by the editor for shape and
 *     asset changes made by the user. Autosave never calls it, so autosave can
 *     never trigger (or wait on) a transcription.
 *   - Each ink edit restarts a 90 s debounce. A meeting's worth of strokes,
 *     and the hundreds of autosaves with them, end in ONE request after the
 *     writer stops.
 *   - When it fires: wait while a save is pending (the gateway reads what is
 *     SAVED), export the page with the same exporter Convert uses, and call
 *     `autoTranscribeSketch`. One request at a time; an edit during it just
 *     restarts the debounce, and the gateway marks the old result stale.
 *   - Opening a sketch whose transcript is missing or out of date schedules
 *     the same 90 s debounce (a catch-up for sketches left before it fired).
 *   - Failures come back as status (`retry` with a time, or `failed`); a
 *     network or export error backs off (2 min, doubling, capped at an hour)
 *     instead of re-exporting every 2 minutes forever. An export that can
 *     never succeed (the page is over the size limit) waits for the next
 *     edit. Nothing here throws, and none of it touches saving.
 *   - A note the gateway says is `off` (a photo note, a locked note) is never
 *     exported or uploaded, even after markup (review 2.8).
 *   - An edit made while a read is in flight means the answer is for OLDER
 *     ink: it never comes back as current (Send tasks would miss the new line).
 *   - `transcribeNow()` reads the page straight away (the status line's
 *     button), skipping the debounce and any backoff.
 *   - The export says when the page is too tall to read well (`tooLong`, 2.7);
 *     the status line shows it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { reportReadLimit } from '@geeksuite/api-client';
import { AUTO_TRANSCRIBE_SKETCH } from '../graphql/mutations';
import { SKETCH_TRANSCRIPT } from '../graphql/queries';

/** After the last ink edit. Configurable here only (spec §1). */
export const AUTO_TRANSCRIBE_DELAY_MS = 90_000;
/** A save is pending, or a request is still running: look again shortly. */
export const BUSY_RECHECK_MS = 5_000;
/** The gateway could not be reached, or the page could not be exported: first wait. */
export const NETWORK_RETRY_MS = 2 * 60_000;
/** ...doubling each time, never longer than this. */
export const MAX_RETRY_MS = 60 * 60_000;

/** The nth consecutive failure's wait (n from 1). */
export const retryDelay = (n) => Math.min(MAX_RETRY_MS, NETWORK_RETRY_MS * 2 ** Math.max(0, n - 1));

/**
 * @param {object} o
 * @param {string|null} o.noteId   the saved sketch's id (null until the first save)
 * @param {boolean} o.enabled      the user's setting (default on)
 * @param {boolean} o.active       a writable sketch is open
 * @param {() => Promise<{base64: string, mediaType: string}|null>} o.exportPage
 *        the page as Convert would send it; null when nothing is drawn
 * @param {() => boolean} o.isBusy a save is pending or running
 * @returns {{ view: object|null, setView: Function, onInkEdit: () => void, transcribeNow: () => void }}
 */
export function useAutoTranscribe({ noteId, enabled, active, exportPage, isBusy }) {
  const { data } = useQuery(SKETCH_TRANSCRIPT, {
    variables: { noteId },
    skip: !noteId || !active,
    fetchPolicy: 'network-only',
  });
  const [autoTranscribe] = useMutation(AUTO_TRANSCRIBE_SKETCH);
  const [view, setView] = useState(null);

  const timerRef = useRef(null);
  const inFlightRef = useRef(false);
  const failuresRef = useRef(0);
  // Bumped by every ink edit: a reading started before the latest edit is old.
  const editSeqRef = useRef(0);
  // The gateway said `off` (photo pages, a locked note): never export it.
  const offRef = useRef(false);
  const live = useRef({});
  live.current = { noteId, enabled, active, exportPage, isBusy, autoTranscribe };

  useEffect(() => {
    offRef.current = false;
    failuresRef.current = 0;
  }, [noteId]);

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const fireRef = useRef(null);
  const schedule = useCallback((ms) => {
    clear();
    timerRef.current = setTimeout(() => fireRef.current?.(), ms);
  }, [clear]);

  const backOff = () => {
    failuresRef.current += 1;
    if (!timerRef.current) schedule(retryDelay(failuresRef.current));
  };

  fireRef.current = async () => {
    timerRef.current = null;
    const o = live.current;
    if (!o.noteId || !o.enabled || !o.active || offRef.current) return;
    if (inFlightRef.current || o.isBusy?.()) {
      schedule(BUSY_RECHECK_MS);
      return;
    }
    inFlightRef.current = true;
    const seq = editSeqRef.current;
    setView((v) => ({ ...(v || {}), status: 'transcribing', current: false }));
    let page;
    try {
      page = await o.exportPage?.();
    } catch (err) {
      inFlightRef.current = false;
      if (err?.code === 'too_large') {
        // It cannot get smaller by waiting: show it, and wait for an edit.
        setView((v) => ({ ...(v || {}), status: 'failed', current: false, error: err.message }));
        return;
      }
      setView((v) => ({ ...(v || {}), status: 'retry', current: false, error: err?.message || null, retryAt: null }));
      backOff();
      return;
    }
    try {
      if (!page) {
        setView((v) => ({ ...(v || {}), status: 'empty' }));
        return;
      }
      const { data: res } = await o.autoTranscribe({
        variables: { noteId: o.noteId, image: page.base64, mediaType: page.mediaType },
      });
      const next = res?.autoTranscribeSketch;
      if (next) {
        failuresRef.current = 0;
        // Not read because today's spending limit is used up: say so, once a day.
        reportReadLimit(next);
        if (next.status === 'off') offRef.current = true;
        const tooLong = Boolean(page.tooLong);
        if (editSeqRef.current !== seq) {
          // The writer added ink while this page was being read: the answer
          // is for the older ink. Keep it out of "current"; the edit has
          // already scheduled the next run.
          setView({ ...next, current: false, text: null, status: next.status === 'searchable' ? 'waiting' : next.status, tooLong });
        } else {
          setView({ ...next, tooLong });
        }
        // A backoff: come back when it ends, unless an edit has already
        // scheduled a run of its own.
        if (next.status === 'retry' && next.retryAt && !timerRef.current) {
          schedule(Math.max(BUSY_RECHECK_MS, Date.parse(next.retryAt) - Date.now()));
        }
      }
    } catch {
      setView((v) => ({ ...(v || {}), status: 'retry', current: false }));
      backOff();
    } finally {
      inFlightRef.current = false;
    }
  };

  // Opening a sketch: catch up on a missing or outdated transcript.
  const loaded = data?.sketchTranscript;
  useEffect(() => {
    if (!loaded) return;
    setView(loaded);
    if (loaded.status === 'off') offRef.current = true;
    if (!live.current.enabled || inFlightRef.current || timerRef.current) return;
    if (loaded.status === 'waiting') schedule(AUTO_TRANSCRIBE_DELAY_MS);
    else if (loaded.status === 'retry' && loaded.retryAt) {
      schedule(Math.max(AUTO_TRANSCRIBE_DELAY_MS, Date.parse(loaded.retryAt) - Date.now()));
    }
  }, [loaded, schedule]);

  // Switched off, or the sketch closed: nothing more is scheduled.
  useEffect(() => {
    if (!enabled || !active) clear();
  }, [enabled, active, clear]);
  useEffect(() => clear, [clear]);

  const onInkEdit = useCallback(() => {
    editSeqRef.current += 1;
    if (!live.current.enabled || !live.current.active || offRef.current) return;
    failuresRef.current = 0;
    setView((v) => (inFlightRef.current ? v : { ...(v || {}), status: 'waiting', current: false, text: null }));
    schedule(AUTO_TRANSCRIBE_DELAY_MS);
  }, [schedule]);

  /** Read the page now (the status line's "Transcribe now"). */
  const transcribeNow = useCallback(() => {
    failuresRef.current = 0;
    schedule(0);
  }, [schedule]);

  return { view, setView, onInkEdit, transcribeNow };
}

export default useAutoTranscribe;
