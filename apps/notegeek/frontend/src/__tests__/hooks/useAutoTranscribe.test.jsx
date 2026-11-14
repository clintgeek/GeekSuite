/**
 * useAutoTranscribe — WHEN a sketch transcribes itself
 * (DOCS/AUTO_TRANSCRIBE_SPEC.md §1, §3, §6, §8). The gateway's half (hashing,
 * single-flight claim, stale results) is tested in basegeek's
 * notegeekAutoTranscribe.test.js; here: debounce, ink-only triggers, one
 * request at a time, catch-up on open, and failures that stay quiet.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const autoTranscribe = vi.fn();
const queryResult = { current: undefined };

vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client');
  return {
    ...actual,
    useQuery: (_doc, opts) => ({ data: opts?.skip ? undefined : queryResult.current, loading: false }),
    useMutation: () => [autoTranscribe, { loading: false }],
  };
});

const { useAutoTranscribe, AUTO_TRANSCRIBE_DELAY_MS, BUSY_RECHECK_MS } = await import('../../hooks/useAutoTranscribe');

const PAGE = { base64: 'iVBOR', mediaType: 'image/png' };
const searchable = { status: 'searchable', current: true, text: 'buy milk', autoEnabled: true };

function setup(over = {}) {
  const props = {
    noteId: 'n1',
    enabled: true,
    active: true,
    exportPage: vi.fn(async () => PAGE),
    isBusy: vi.fn(() => false),
    ...over,
  };
  const hook = renderHook((p) => useAutoTranscribe(p), { initialProps: props });
  return { ...hook, props };
}

/** Run timers and let the async fire settle. */
async function advance(ms) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

beforeEach(() => {
  vi.useFakeTimers();
  autoTranscribe.mockReset();
  autoTranscribe.mockResolvedValue({ data: { autoTranscribeSketch: searchable } });
  queryResult.current = undefined;
});
afterEach(() => vi.useRealTimers());

describe('scheduling', () => {
  it('nothing happens without an ink edit — autosave has no way in', async () => {
    setup();
    await advance(10 * 60_000);
    expect(autoTranscribe).not.toHaveBeenCalled();
  });

  it('fires 90 s after the last ink edit, and each edit restarts the wait', async () => {
    const { result } = setup();
    act(() => result.current.onInkEdit());
    await advance(AUTO_TRANSCRIBE_DELAY_MS - 1000);
    act(() => result.current.onInkEdit());
    await advance(AUTO_TRANSCRIBE_DELAY_MS - 1000);
    expect(autoTranscribe).not.toHaveBeenCalled();
    await advance(1000);
    expect(autoTranscribe).toHaveBeenCalledTimes(1);
    expect(autoTranscribe.mock.calls[0][0].variables).toEqual({ noteId: 'n1', image: 'iVBOR', mediaType: 'image/png' });
    expect(result.current.view.status).toBe('searchable');
  });

  it('a meeting: 300 ink edits (and the autosaves with them) end in ONE request', async () => {
    const { result } = setup();
    for (let i = 0; i < 300; i += 1) {
      act(() => result.current.onInkEdit());
      await advance(2000); // an autosave's worth of time between strokes
    }
    expect(autoTranscribe).not.toHaveBeenCalled();
    await advance(AUTO_TRANSCRIBE_DELAY_MS);
    expect(autoTranscribe).toHaveBeenCalledTimes(1);
  });

  it('waits while a save is pending; the save itself is never held up', async () => {
    let busy = true;
    const { result } = setup({ isBusy: vi.fn(() => busy) });
    act(() => result.current.onInkEdit());
    await advance(AUTO_TRANSCRIBE_DELAY_MS);
    expect(autoTranscribe).not.toHaveBeenCalled();
    busy = false;
    await advance(BUSY_RECHECK_MS);
    expect(autoTranscribe).toHaveBeenCalledTimes(1);
  });

  it('switched off: ink edits schedule nothing', async () => {
    const { result } = setup({ enabled: false });
    act(() => result.current.onInkEdit());
    await advance(10 * 60_000);
    expect(autoTranscribe).not.toHaveBeenCalled();
  });
});

describe('one request at a time', () => {
  it('an edit during a request does not start a second one; it runs 90 s later', async () => {
    let release;
    autoTranscribe.mockImplementationOnce(() => new Promise((resolve) => {
      release = () => resolve({ data: { autoTranscribeSketch: { status: 'waiting', autoEnabled: true } } });
    }));
    const { result } = setup();
    act(() => result.current.onInkEdit());
    await advance(AUTO_TRANSCRIBE_DELAY_MS);
    expect(autoTranscribe).toHaveBeenCalledTimes(1);
    act(() => result.current.onInkEdit()); // the writer adds a stroke mid-request
    await advance(AUTO_TRANSCRIBE_DELAY_MS - 1000);
    expect(autoTranscribe).toHaveBeenCalledTimes(1);
    await act(async () => { release(); });
    await advance(1000 + BUSY_RECHECK_MS);
    expect(autoTranscribe).toHaveBeenCalledTimes(2);
  });

  it('a slow request still running when the next timer fires: no second request until it ends', async () => {
    let release;
    autoTranscribe.mockImplementationOnce(() => new Promise((resolve) => {
      release = () => resolve({ data: { autoTranscribeSketch: { status: 'waiting', autoEnabled: true } } });
    }));
    const { result } = setup();
    act(() => result.current.onInkEdit());
    await advance(AUTO_TRANSCRIBE_DELAY_MS);
    act(() => result.current.onInkEdit());
    await advance(AUTO_TRANSCRIBE_DELAY_MS + 3 * BUSY_RECHECK_MS); // the request is still running
    expect(autoTranscribe).toHaveBeenCalledTimes(1);
    await act(async () => { release(); });
    await advance(BUSY_RECHECK_MS);
    expect(autoTranscribe).toHaveBeenCalledTimes(2);
  });
});

describe('opening a sketch', () => {
  it('a missing or outdated transcript schedules the normal 90 s debounce', async () => {
    queryResult.current = { sketchTranscript: { status: 'waiting', autoEnabled: true } };
    setup();
    await advance(AUTO_TRANSCRIBE_DELAY_MS - 1000);
    expect(autoTranscribe).not.toHaveBeenCalled();
    await advance(1000);
    expect(autoTranscribe).toHaveBeenCalledTimes(1);
  });

  it('a current transcript schedules nothing', async () => {
    queryResult.current = { sketchTranscript: searchable };
    const { result } = setup();
    await advance(10 * 60_000);
    expect(autoTranscribe).not.toHaveBeenCalled();
    expect(result.current.view.status).toBe('searchable');
  });
});

describe('failures stay quiet', () => {
  it('a network error never throws: it shows "retry" and tries again later', async () => {
    autoTranscribe.mockRejectedValueOnce(new Error('offline'));
    const { result } = setup();
    act(() => result.current.onInkEdit());
    await advance(AUTO_TRANSCRIBE_DELAY_MS);
    expect(result.current.view.status).toBe('retry');
    expect(result.current.view.current).toBe(false);
    await advance(2 * 60_000);
    expect(autoTranscribe).toHaveBeenCalledTimes(2);
    expect(result.current.view.status).toBe('searchable');
  });

  it('a gateway backoff is honoured: no request before retryAt', async () => {
    autoTranscribe.mockResolvedValueOnce({ data: { autoTranscribeSketch: {
      status: 'retry', retryAt: new Date(Date.now() + AUTO_TRANSCRIBE_DELAY_MS + 10 * 60_000).toISOString(), autoEnabled: true,
    } } });
    const { result } = setup();
    act(() => result.current.onInkEdit());
    await advance(AUTO_TRANSCRIBE_DELAY_MS);
    await advance(9 * 60_000);
    expect(autoTranscribe).toHaveBeenCalledTimes(1);
    await advance(60_000);
    expect(autoTranscribe).toHaveBeenCalledTimes(2);
  });

  it('nothing drawn: nothing is sent', async () => {
    const { result } = setup({ exportPage: vi.fn(async () => null) });
    act(() => result.current.onInkEdit());
    await advance(AUTO_TRANSCRIBE_DELAY_MS);
    expect(autoTranscribe).not.toHaveBeenCalled();
  });
});
