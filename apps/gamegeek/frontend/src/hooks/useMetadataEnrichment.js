/**
 * The enrichment worker's status (DOCS/METADATA_ENRICHMENT.md). Loaded once
 * on mount, then polled every 5s — but ONLY while the worker is `running`,
 * this hook is mounted, and the tab is visible. A backgrounded tab or a
 * closed Settings card stops the timer outright rather than skipping ticks,
 * so nothing keeps a five-second fetch loop alive after the card is gone.
 *
 * `onFinished` fires once, the moment `running` flips true → false, so the
 * caller can refetch the library queries that pick up new covers/metadata.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getEnrichStatus } from '../api/rest';

const POLL_MS = 5000;

export function useMetadataStatus({ onFinished } = {}) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const wasRunning = useRef(false);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  const load = useCallback(async () => {
    try {
      const res = await getEnrichStatus();
      setStatus(res);
      setError(null);
      if (wasRunning.current && !res?.running) onFinishedRef.current?.();
      wasRunning.current = Boolean(res?.running);
      return res;
    } catch (err) {
      setError(err?.message || "Couldn't load the metadata status.");
      return null;
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const running = Boolean(status?.running);
  useEffect(() => {
    if (!running || typeof document === 'undefined') return undefined;
    let id = null;
    const start = () => {
      if (id === null) id = setInterval(load, POLL_MS);
    };
    const stop = () => {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') stop();
      else start();
    };
    if (document.visibilityState !== 'hidden') start();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [running, load]);

  return { status, error, reload: load };
}
