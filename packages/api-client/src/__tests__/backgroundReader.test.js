/**
 * The background reader's schedule and rules (utils/backgroundReader.js):
 * which sketches it draws and sends, when it asks, and when it stops.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBackgroundReader, setOpenSketch, sketchClosed, getOpenSketch,
  FIRST_PASS_MS, IDLE_PASS_MS, NEXT_BATCH_MS, AFTER_CLOSE_MS, VISIBLE_PASS_MS, BATCH,
  onReadLimit,
  reportReadLimit,
  _resetReadLimit,
} from '../backgroundReader.js';

const opName = (doc) => doc.definitions[0].name.value;
const PAGE = { base64: 'aW1n', mediaType: 'image/png' };

/** A gateway: `waiting` is what the list answers; each read answers `status(id)`. */
function gateway({ waiting = [], status = () => 'searchable', transcript = () => ({ status: 'waiting', autoEnabled: true }) } = {}) {
  const calls = [];
  const state = { waiting: [...waiting] };
  const client = {
    query: vi.fn(async ({ query, variables, fetchPolicy }) => {
      const name = opName(query);
      calls.push({ name, variables, fetchPolicy });
      if (name === 'SketchesToTranscribe') return { data: { sketchesToTranscribe: state.waiting.slice(0, variables.limit) } };
      if (name === 'SketchToRead') return { data: { note: { id: variables.id, type: 'handwritten', content: `drawing-${variables.id}` } } };
      if (name === 'SketchReadState') return { data: { sketchTranscript: transcript(variables.noteId) } };
      throw new Error(`unexpected ${name}`);
    }),
    mutate: vi.fn(async ({ mutation, variables }) => {
      calls.push({ name: opName(mutation), variables });
      const s = status(variables.noteId);
      if (s === 'searchable') state.waiting = state.waiting.filter((id) => id !== variables.noteId);
      return { data: { autoTranscribeSketch: { status: s } } };
    }),
  };
  const sent = () => calls.filter((c) => c.name === 'BackgroundTranscribeSketch').map((c) => c.variables.noteId);
  const asked = () => calls.filter((c) => c.name === 'SketchesToTranscribe').length;
  return { client, calls, state, sent, asked };
}

const doc = () => {
  const d = new EventTarget();
  d.visibilityState = 'visible';
  return d;
};

let reader;
const make = (gw, over = {}) => {
  reader = createBackgroundReader({ client: gw.client, render: vi.fn(async () => PAGE), doc: doc(), nav: { onLine: true }, ...over });
  return reader;
};

beforeEach(() => {
  vi.useFakeTimers();
  setOpenSketch(null);
});
afterEach(() => {
  reader?.stop();
  reader = null;
  vi.useRealTimers();
});

describe('the background reader', () => {
  it('asks a little after the app opens, draws each waiting sketch and sends it as a background read', async () => {
    const gw = gateway({ waiting: ['a', 'b'] });
    const render = vi.fn(async () => PAGE);
    make(gw, { render }).start();
    await vi.advanceTimersByTimeAsync(FIRST_PASS_MS - 1);
    expect(gw.asked()).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(gw.sent()).toEqual(['a', 'b']);
    expect(render.mock.calls.map((c) => c[0])).toEqual(['drawing-a', 'drawing-b']);
    const mutation = gw.client.mutate.mock.calls[0][0];
    expect(mutation.variables).toEqual({ noteId: 'a', image: 'aW1n', mediaType: 'image/png' });
    expect(mutation.mutation.loc.source.body).toMatch(/background:\s*true/);
    // The drawing is megabytes: never kept in the cache.
    expect(gw.calls.find((c) => c.name === 'SketchToRead').fetchPolicy).toBe('no-cache');
  });

  it('a full batch that was read is followed at once by the next; then it idles', async () => {
    const all = ['a', 'b', 'c', 'd'];
    const gw = gateway({ waiting: all });
    make(gw).start();
    await vi.advanceTimersByTimeAsync(FIRST_PASS_MS);
    expect(gw.sent()).toEqual(all.slice(0, BATCH));
    await vi.advanceTimersByTimeAsync(NEXT_BATCH_MS);
    expect(gw.sent()).toEqual(all);
    const asked = gw.asked();
    await vi.advanceTimersByTimeAsync(IDLE_PASS_MS - 1);
    expect(gw.asked()).toBe(asked);
    await vi.advanceTimersByTimeAsync(1);
    expect(gw.asked()).toBe(asked + 1);
  });

  it("the day's cap or an outage stops the pass: the next sketch is not drawn", async () => {
    const gw = gateway({ waiting: ['a', 'b', 'c'], status: () => 'retry' });
    const render = vi.fn(async () => PAGE);
    make(gw, { render }).start();
    await vi.advanceTimersByTimeAsync(FIRST_PASS_MS);
    expect(gw.sent()).toEqual(['a']);
    expect(render).toHaveBeenCalledTimes(1);
    // And it is not hammered: nothing more until the idle pass.
    await vi.advanceTimersByTimeAsync(NEXT_BATCH_MS * 3);
    expect(gw.asked()).toBe(1);
  });

  it('a page that cannot be drawn, or has no ink, is skipped for the session and does not block the ones behind it', async () => {
    const gw = gateway({ waiting: ['big', 'blank', 'a', 'b'] });
    const render = vi.fn(async (content) => {
      if (content === 'drawing-big') throw new Error('too large');
      if (content === 'drawing-blank') return null;
      return PAGE;
    });
    make(gw, { render }).start();
    await vi.advanceTimersByTimeAsync(FIRST_PASS_MS);
    expect(gw.sent()).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(NEXT_BATCH_MS);
    // Asked for five this time (three plus the two it gave up on), so `b` is reached.
    expect(gw.calls.filter((c) => c.name === 'SketchesToTranscribe')[1].variables.limit).toBe(BATCH + 2);
    expect(gw.sent()).toEqual(['a', 'b']);
    expect(render.mock.calls.filter((c) => c[0] === 'drawing-big')).toHaveLength(1);
  });

  it('never reads the sketch that is open: its own editor does', async () => {
    const gw = gateway({ waiting: ['open', 'a'] });
    setOpenSketch('open');
    make(gw).start();
    await vi.advanceTimersByTimeAsync(FIRST_PASS_MS);
    expect(gw.sent()).toEqual(['a']);
  });

  it('a sketch opened while it was being drawn is not sent', async () => {
    const gw = gateway({ waiting: ['a'] });
    make(gw, { render: vi.fn(async () => { setOpenSketch('a'); return PAGE; }) }).start();
    await vi.advanceTimersByTimeAsync(FIRST_PASS_MS);
    expect(gw.sent()).toEqual([]);
  });

  it('a sketch that was just closed is read a few seconds later, without waiting to be listed', async () => {
    const gw = gateway({ waiting: [] });
    make(gw).start();
    setOpenSketch('n1');
    sketchClosed('n1');
    expect(getOpenSketch()).toBe(null);
    await vi.advanceTimersByTimeAsync(AFTER_CLOSE_MS - 1);
    expect(gw.sent()).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(gw.sent()).toEqual(['n1']);
    expect(gw.asked()).toBe(0); // straight to the sketch, not the list
  });

  it('a closed sketch that is already searchable, or with reading switched off, is not drawn', async () => {
    for (const view of [{ status: 'searchable', autoEnabled: true }, { status: 'waiting', autoEnabled: false }, { status: 'off', autoEnabled: true }]) {
      const gw = gateway({ transcript: () => view });
      const render = vi.fn(async () => PAGE);
      make(gw, { render }).start();
      sketchClosed('n1');
      await vi.advanceTimersByTimeAsync(AFTER_CLOSE_MS);
      expect(render).not.toHaveBeenCalled();
      expect(gw.sent()).toEqual([]);
      reader.stop();
    }
  });

  it('does nothing while the app is hidden or offline, and looks soon after it comes back', async () => {
    const gw = gateway({ waiting: ['a'] });
    const d = doc();
    d.visibilityState = 'hidden';
    make(gw, { doc: d }).start();
    await vi.advanceTimersByTimeAsync(FIRST_PASS_MS + IDLE_PASS_MS);
    expect(gw.asked()).toBe(0);
    d.visibilityState = 'visible';
    d.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(VISIBLE_PASS_MS);
    expect(gw.sent()).toEqual(['a']);
  });

  it('a gateway that cannot be asked (offline, or older than the query) is asked again later, quietly', async () => {
    const gw = gateway();
    gw.client.query.mockRejectedValueOnce(new Error('Cannot query field "sketchesToTranscribe"'));
    make(gw).start();
    await vi.advanceTimersByTimeAsync(FIRST_PASS_MS);
    gw.state.waiting = ['a'];
    await vi.advanceTimersByTimeAsync(IDLE_PASS_MS);
    expect(gw.sent()).toEqual(['a']);
  });

  it('stop() ends it: no timer, no listeners', async () => {
    const gw = gateway({ waiting: ['a'] });
    make(gw).start();
    reader.stop();
    sketchClosed('n1');
    await vi.advanceTimersByTimeAsync(FIRST_PASS_MS + IDLE_PASS_MS);
    expect(gw.client.query).not.toHaveBeenCalled();
  });
});

describe("today's limit is said out loud, once a day (2026-11-24)", () => {
  const memory = () => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
  };
  const spent = { status: 'retry', errorCode: 'AI_BUDGET', retryAt: '2026-11-25T00:00:00.000Z', error: 'x' };
  const NOW = Date.parse('2026-11-24T15:00:00.000Z');

  beforeEach(() => { _resetReadLimit(); globalThis.localStorage?.clear?.(); });
  afterEach(() => _resetReadLimit());

  it('tells the listener when a read failed because of the spending limit', () => {
    const told = vi.fn();
    onReadLimit(told);
    expect(reportReadLimit(spent, { now: NOW, storage: memory() })).toBe(true);
    expect(told).toHaveBeenCalledTimes(1);
    expect(told.mock.calls[0][0]).toMatchObject({ code: 'AI_BUDGET', retryAt: spent.retryAt });
    expect(told.mock.calls[0][0].message).toMatch(/spending limit is used up/);
  });

  it('says it once a day per device, and again the next day', () => {
    const told = vi.fn();
    const storage = memory();
    onReadLimit(told);
    reportReadLimit(spent, { now: NOW, storage });
    reportReadLimit(spent, { now: NOW + 60_000, storage });
    expect(told).toHaveBeenCalledTimes(1);
    reportReadLimit(spent, { now: NOW + 24 * 60 * 60 * 1000, storage });
    expect(told).toHaveBeenCalledTimes(2);
  });

  it('says nothing for an outage, a page that was read, or a state with no reason', () => {
    const told = vi.fn();
    onReadLimit(told);
    for (const view of [
      { status: 'retry', errorCode: 'AI_UNAVAILABLE' },
      { status: 'retry', errorCode: null },
      { status: 'searchable', errorCode: null },
      { status: 'failed', errorCode: 'AI_BUDGET' },
      null,
    ]) expect(reportReadLimit(view, { now: NOW, storage: memory() })).toBe(false);
    expect(told).not.toHaveBeenCalled();
  });

  it('is not marked as said when nobody was listening, and survives storage that throws', () => {
    const storage = memory();
    expect(reportReadLimit(spent, { now: NOW, storage })).toBe(false);
    const told = vi.fn();
    onReadLimit(told);
    expect(reportReadLimit(spent, { now: NOW, storage })).toBe(true);
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(() => reportReadLimit(spent, { now: NOW + 48 * 60 * 60 * 1000, storage: broken })).not.toThrow();
    expect(told).toHaveBeenCalledTimes(2);
  });

  it('the background reader reports what the gateway said about the page it sent', async () => {
    const told = vi.fn();
    onReadLimit(told);
    const gw = gateway({ waiting: ['a'] });
    gw.client.mutate.mockImplementation(async () => ({ data: { autoTranscribeSketch: spent } }));
    make(gw);
    reader.start();
    const outcomes = await reader.pass();
    expect(outcomes).toEqual(['a:retry']);
    expect(told).toHaveBeenCalledTimes(1);
  });
});
