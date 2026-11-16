// @vitest-environment jsdom
/**
 * useRefetchOnResume (plan 2.3): re-read when the app is visible again or the
 * connection is back — never on first mount, throttled, cleaned up.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { REFETCH_ON_RESUME_MIN_MS, useRefetchOnResume } from '../index.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root = null;
let host = null;
let markFresh = null;
let visibility = 'visible';

function Probe({ refetch, opts }) {
  markFresh = useRefetchOnResume(refetch, opts);
  return null;
}
const mount = async (ui) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(ui));
};
const becomeVisible = () =>
  act(async () => {
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
  });
const becomeHidden = () =>
  act(async () => {
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
  });
const goOnline = () => act(async () => window.dispatchEvent(new Event('online')));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  root = null;
  vi.useRealTimers();
});

describe('useRefetchOnResume', () => {
  it('does not call refetch on first mount', async () => {
    const refetch = vi.fn();
    await mount(<Probe refetch={refetch} />);
    expect(refetch).not.toHaveBeenCalled();
  });

  it('re-reads when the page becomes visible after the throttle', async () => {
    const refetch = vi.fn();
    await mount(<Probe refetch={refetch} />);
    await becomeHidden();
    vi.advanceTimersByTime(REFETCH_ON_RESUME_MIN_MS + 1);
    await becomeVisible();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('a hidden page does not re-read', async () => {
    const refetch = vi.fn();
    await mount(<Probe refetch={refetch} />);
    vi.advanceTimersByTime(REFETCH_ON_RESUME_MIN_MS + 1);
    await becomeHidden();
    expect(refetch).not.toHaveBeenCalled();
  });

  it('is throttled: a quick return, and focus right after visibility, read once', async () => {
    const refetch = vi.fn();
    await mount(<Probe refetch={refetch} />);
    vi.advanceTimersByTime(5000);
    await becomeVisible();
    expect(refetch).not.toHaveBeenCalled(); // 5 s after mount: too soon
    vi.advanceTimersByTime(REFETCH_ON_RESUME_MIN_MS);
    await becomeVisible();
    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('honours a custom minIntervalMs', async () => {
    const refetch = vi.fn();
    await mount(<Probe refetch={refetch} opts={{ minIntervalMs: 1000 }} />);
    vi.advanceTimersByTime(1001);
    await becomeVisible();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('re-reads when the connection comes back (its own shorter throttle)', async () => {
    const refetch = vi.fn();
    await mount(<Probe refetch={refetch} />);
    vi.advanceTimersByTime(6000);
    await goOnline();
    expect(refetch).toHaveBeenCalledTimes(1);
    await goOnline();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('re-reads on a back-forward-cache restore', async () => {
    const refetch = vi.fn();
    await mount(<Probe refetch={refetch} />);
    vi.advanceTimersByTime(REFETCH_ON_RESUME_MIN_MS + 1);
    const ev = new Event('pageshow');
    ev.persisted = true;
    await act(async () => window.dispatchEvent(ev));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('does not overlap: a read still in flight is not started again', async () => {
    let resolve;
    const refetch = vi.fn(() => new Promise((r) => { resolve = r; }));
    await mount(<Probe refetch={refetch} opts={{ onlineMinIntervalMs: 0 }} />);
    vi.advanceTimersByTime(10);
    await goOnline();
    vi.advanceTimersByTime(10);
    await goOnline();
    expect(refetch).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
    vi.advanceTimersByTime(10);
    await goOnline();
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it('markFresh restarts the clock', async () => {
    const refetch = vi.fn();
    await mount(<Probe refetch={refetch} />);
    vi.advanceTimersByTime(REFETCH_ON_RESUME_MIN_MS - 1000);
    markFresh();
    vi.advanceTimersByTime(2000);
    await becomeVisible();
    expect(refetch).not.toHaveBeenCalled();
  });

  it('calls the latest refetch, not the one from the first render', async () => {
    const first = vi.fn();
    const second = vi.fn();
    await mount(<Probe refetch={first} />);
    await act(async () => root.render(<Probe refetch={second} />));
    vi.advanceTimersByTime(REFETCH_ON_RESUME_MIN_MS + 1);
    await becomeVisible();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('enabled: false listens to nothing', async () => {
    const refetch = vi.fn();
    await mount(<Probe refetch={refetch} opts={{ enabled: false }} />);
    vi.advanceTimersByTime(REFETCH_ON_RESUME_MIN_MS + 1);
    await becomeVisible();
    await goOnline();
    expect(refetch).not.toHaveBeenCalled();
  });

  it('pollMs re-reads on an interval while visible', async () => {
    const refetch = vi.fn();
    await mount(<Probe refetch={refetch} opts={{ pollMs: 60_000 }} />);
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(refetch).toHaveBeenCalledTimes(1);
    visibility = 'hidden';
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('removes its listeners on unmount', async () => {
    const refetch = vi.fn();
    await mount(<Probe refetch={refetch} />);
    await act(async () => root.unmount());
    root = null;
    vi.advanceTimersByTime(REFETCH_ON_RESUME_MIN_MS + 1);
    await becomeVisible();
    await goOnline();
    expect(refetch).not.toHaveBeenCalled();
  });
});
