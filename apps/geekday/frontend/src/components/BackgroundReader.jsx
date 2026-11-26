/**
 * BackgroundReader — draws pages nobody is writing on, so they can be read
 * and searched (apps/notegeek/DOCS/AUTO_TRANSCRIBE_SPEC.md, "Background
 * reader").
 *
 * A day's page is a NoteGeek sketch, and until 2026-11-22 it was only ever
 * read when somebody opened it IN NoteGeek. Now GeekDay asks the gateway
 * which sketches are waiting (unread, and unchanged for 90 s: the page being
 * written on is left alone), draws each one off-screen in the same canvas the
 * day page uses (read-only, never focused), and sends the image.
 *
 * The schedule and the rules are @geeksuite/api-client's backgroundReader.js.
 * This shows nothing (but one notice when the day's spending limit stops a read) and can break nothing: a page that fails to load or to
 * draw waits for next time.
 */
import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { useApolloClient } from '@apollo/client';
import { createBackgroundReader, onReadLimit } from '@geeksuite/api-client';
import { useToast } from '@geeksuite/ui';

const InkCanvas = lazy(() => import('../ink/index.js').then((module) => ({ default: module.InkCanvas })));

/** A page that has not been drawn in this long is given up on (for this session). */
export const RENDER_TIMEOUT_MS = 30_000;
/** How often to look for the canvas having mounted. */
export const READY_POLL_MS = 100;
/** After it has: one more beat for the loaded page to lay out. */
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
  width: 800,
  height: 1000,
  opacity: 0,
  pointerEvents: 'none',
  overflow: 'hidden',
};

export default function BackgroundReader() {
  const client = useApolloClient();
  const [job, setJob] = useState(null);
  const seq = useRef(0);

  const render = useCallback((content) => new Promise((resolve, reject) => {
    let done = false;
    let poll = null;
    let timer = null;
    const apiRef = { current: null };
    const finish = (settle, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearInterval(poll);
      setJob(null);
      settle(value);
    };
    timer = setTimeout(() => finish(reject, new Error('The page was not drawn in time.')), RENDER_TIMEOUT_MS);
    poll = setInterval(() => {
      const api = apiRef.current;
      if (!api?.isReady?.()) return;
      clearInterval(poll);
      setTimeout(async () => {
        try {
          finish(resolve, await api.exportPage());
        } catch (err) {
          finish(reject, err);
        }
      }, SETTLE_MS);
    }, READY_POLL_MS);
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
          {/* An unreadable page is not read as a blank one: it waits for next time. */}
          <InkCanvas content={job.content} readOnly autoFocus={false} apiRef={job.apiRef} onLoadError={(_, error) => job.fail(error)} />
        </Suspense>
      </Quiet>
    </div>
  );
}
