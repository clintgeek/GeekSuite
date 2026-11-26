/**
 * BackgroundReader — draws sketches nobody has open, so they can be read and
 * searched (DOCS/AUTO_TRANSCRIBE_SPEC.md, "Background reader").
 *
 * The schedule and the rules are @geeksuite/api-client's backgroundReader.js. This is the part
 * that needs React: one sketch at a time is mounted off-screen in the same
 * editor the note page uses (read-only, never focused), exported with the
 * same exporter, and unmounted. tldraw is loaded only when there is a page to
 * draw. It shows nothing (but one notice when the day's spending limit stops a read) and can break nothing: an editor that fails to load
 * or to draw is a page that waits for next time.
 */
import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { apolloClient } from '../apolloClient';
import { createBackgroundReader, onReadLimit } from '@geeksuite/api-client';
import { useToast } from '@geeksuite/ui';

const HandwrittenEditor = lazy(() => import('./editors/HandwrittenEditor'));

/** A page that has not been drawn in this long is given up on (for this session). */
export const RENDER_TIMEOUT_MS = 30_000;
/** After the editor mounts: it hands over its API just before it loads the drawing. */
export const SETTLE_MS = 150;

class Quiet extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    this.props.onError?.(error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const offscreen = {
  position: 'fixed',
  left: -20000,
  top: 0,
  width: 1024,
  height: 768,
  opacity: 0,
  pointerEvents: 'none',
  overflow: 'hidden',
};

export default function BackgroundReader({ client = apolloClient }) {
  const [job, setJob] = useState(null);
  const seq = useRef(0);

  const render = useCallback((content) => new Promise((resolve, reject) => {
    let done = false;
    let timer = null;
    const finish = (settle, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      setJob(null);
      settle(value);
    };
    timer = setTimeout(() => finish(reject, new Error('The page was not drawn in time.')), RENDER_TIMEOUT_MS);
    let api = null;
    // The editor assigns its API to `sketchApiRef.current` as it mounts.
    const apiRef = {
      get current() {
        return api;
      },
      set current(next) {
        api = next;
        if (!next) return;
        setTimeout(async () => {
          try {
            // A body that could not be read is not a blank page: reject, so no
            // empty transcript is stored for it.
            if (next.loadFailed?.()) throw new Error('The saved writing could not be read.');
            finish(resolve, next.hasShapes?.() ? await next.exportPng() : null);
          } catch (err) {
            finish(reject, err);
          }
        }, SETTLE_MS);
      },
    };
    seq.current += 1;
    setJob({ key: seq.current, content, apiRef, fail: (err) => finish(reject, err) });
  }), []);

  // The one thing this says out loud: a page was not read because today's
  // spending limit is used up (once a day; api-client's reportReadLimit).
  const { notify } = useToast();
  useEffect(() => onReadLimit((notice) => {
    notify(notice.message, { tone: 'warning', duration: 12000 });
  }), [notify]);

  useEffect(() => {
    const reader = createBackgroundReader({ client, render });
    reader.start();
    return () => reader.stop();
  }, [client, render]);

  if (!job) return null;
  return (
    <div aria-hidden="true" inert="" data-testid="background-reader" style={offscreen}>
      <Quiet key={job.key} onError={job.fail}>
        <Suspense fallback={null}>
          <HandwrittenEditor content={job.content} readOnly autoFocus={false} sketchApiRef={job.apiRef} onLoadError={job.fail} />
        </Suspense>
      </Quiet>
    </div>
  );
}
