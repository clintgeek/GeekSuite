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
 *     network error is retried after a pause. Nothing here throws, and none
 *     of it touches saving.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { AUTO_TRANSCRIBE_SKETCH } from '../graphql/mutations';
import { SKETCH_TRANSCRIPT } from '../graphql/queries';

/** After the last ink edit. Configurable here only (spec §1). */
export const AUTO_TRANSCRIBE_DELAY_MS = 90_000;
/** A save is pending, or a request is still running: look again shortly. */
export const BUSY_RECHECK_MS = 5_000;
/** The gateway could not be reached at all. */
export const NETWORK_RETRY_MS = 2 * 60_000;

/**
 * @param {object} o
 * @param {string|null} o.noteId   the saved sketch's id (null until the first save)
 * @param {boolean} o.enabled      the user's setting (default on)
 * @param {boolean} o.active       a writable sketch is open
 * @param {() => Promise<{base64: string, mediaType: string}|null>} o.exportPage
 *        the page as Convert would send it; null when nothing is drawn
 * @param {() => boolean} o.isBusy a save is pending or running
 * @returns {{ view: object|null, onInkEdit: () => void }}
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
  const live = useRef({});
  live.current = { noteId, enabled, active, exportPage, isBusy, autoTranscribe };

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const fireRef = useRef(null);
  const schedule = useCallback((ms) => {
    clear();
    timerRef.current = setTimeout(() => fireRef.current?.(), ms);
  }, [clear]);

  fireRef.current = async () => {
    timerRef.current = null;
    const o = live.current;
    if (!o.noteId || !o.enabled || !o.active) return;
    if (inFlightRef.current || o.isBusy?.()) {
      schedule(BUSY_RECHECK_MS);
      return;
    }
    inFlightRef.current = true;
    setView((v) => ({ ...(v || {}), status: 'transcribing', current: false }));
    try {
      const page = await o.exportPage?.();
      if (!page) {
        setView((v) => ({ ...(v || {}), status: 'empty' }));
        return;
      }
      const { data: res } = await o.autoTranscribe({
        variables: { noteId: o.noteId, image: page.base64, mediaType: page.mediaType },
      });
      const next = res?.autoTranscribeSketch;
      if (next) {
        setView(next);
        // A backoff: come back when it ends, unless an edit has already
        // scheduled a run of its own.
        if (next.status === 'retry' && next.retryAt && !timerRef.current) {
          schedule(Math.max(BUSY_RECHECK_MS, Date.parse(next.retryAt) - Date.now()));
        }
      }
    } catch {
      setView((v) => ({ ...(v || {}), status: 'retry', current: false }));
      if (!timerRef.current) schedule(NETWORK_RETRY_MS);
    } finally {
      inFlightRef.current = false;
    }
  };

  // Opening a sketch: catch up on a missing or outdated transcript.
  const loaded = data?.sketchTranscript;
  useEffect(() => {
    if (!loaded) return;
    setView(loaded);
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
    if (!live.current.enabled || !live.current.active) return;
    setView((v) => (inFlightRef.current ? v : { ...(v || {}), status: 'waiting', current: false, text: null }));
    schedule(AUTO_TRANSCRIBE_DELAY_MS);
  }, [schedule]);

  return { view, setView, onInkEdit };
}

export default useAutoTranscribe;
