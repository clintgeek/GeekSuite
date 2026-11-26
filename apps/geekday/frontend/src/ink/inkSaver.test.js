import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createInkSaver, SAVE_DEBOUNCE_MS, ECHOES_KEPT } from './inkSaver';

function setup() {
  const state = { body: 'v0' };
  const serialize = vi.fn(() => state.body);
  const emit = vi.fn();
  return { state, serialize, emit, saver: createInkSaver({ serialize, emit }) };
}

describe('createInkSaver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('an edit is serialised once, 400 ms after the LAST edit, never at the edit itself', () => {
    const { saver, serialize, emit, state } = setup();
    state.body = 'v1';
    saver.markDirty();
    vi.advanceTimersByTime(300);
    saver.markDirty();
    saver.markDirty();
    expect(serialize).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS - 1);
    expect(emit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(serialize).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('v1');
  });

  it('flush hands over pending ink now and returns it; nothing pending is null', () => {
    const { saver, emit, state } = setup();
    expect(saver.flush()).toBe(null);
    state.body = 'v1';
    saver.markDirty();
    expect(saver.hasPending()).toBe(true);
    expect(saver.flush()).toBe('v1');
    expect(saver.hasPending()).toBe(false);
    expect(emit).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(emit).toHaveBeenCalledTimes(1); // the debounce was cancelled
    expect(saver.flush()).toBe(null);
  });

  it('a load is not an edit: it drops what was pending and is never emitted', () => {
    const { saver, emit, state } = setup();
    state.body = 'v1';
    saver.markDirty();
    saver.loaded('other day');
    vi.advanceTimersByTime(1000);
    expect(emit).not.toHaveBeenCalled();
    expect(saver.isOwn('other day')).toBe(true);
  });

  it('an edit that serialises to what is already known emits nothing', () => {
    const { saver, emit, state } = setup();
    saver.loaded('same');
    state.body = 'same';
    saver.markDirty();
    expect(saver.flush()).toBe(null);
    expect(emit).not.toHaveBeenCalled();
  });

  it('the echo guard: our last saves are ours, even after newer ones; anything else is not', () => {
    const { saver, state } = setup();
    for (let i = 1; i <= ECHOES_KEPT + 1; i += 1) {
      state.body = `v${i}`;
      saver.markDirty();
      saver.flush();
    }
    expect(saver.isOwn(`v${ECHOES_KEPT + 1}`)).toBe(true);
    expect(saver.isOwn('v2')).toBe(true);
    expect(saver.isOwn('v1')).toBe(false); // fell off the end
    expect(saver.isOwn('from another device')).toBe(false);
  });

  it('after a load, an earlier save is no longer an echo: going back to that page must load it', () => {
    const { saver, state } = setup();
    state.body = 'day A';
    saver.markDirty();
    saver.flush();
    expect(saver.isOwn('day A')).toBe(true);
    saver.loaded('day B');
    expect(saver.isOwn('day B')).toBe(true);
    expect(saver.isOwn('day A')).toBe(false);
  });

  it('a blank page: null and "" are the same body, and blank is not ours once there is ink', () => {
    const { saver, state } = setup();
    expect(saver.isOwn(null)).toBe(true);
    expect(saver.isOwn('')).toBe(true);
    state.body = 'v1';
    saver.markDirty();
    saver.flush();
    expect(saver.isOwn(null)).toBe(false);
  });

  it('a serialiser that throws loses nothing but that attempt', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const emit = vi.fn();
    const saver = createInkSaver({ serialize: () => { throw new Error('boom'); }, emit });
    saver.markDirty();
    expect(saver.flush()).toBe(null);
    expect(emit).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('dispose cancels the pending debounce', () => {
    const { saver, emit } = setup();
    saver.markDirty();
    saver.dispose();
    vi.advanceTimersByTime(1000);
    expect(emit).not.toHaveBeenCalled();
  });

  it('hasBody: has this page ever had a body (loaded with one, or saved one)?', () => {
    let body = 'one';
    const saver = createInkSaver({ serialize: () => body, emit: () => {} });
    expect(saver.hasBody()).toBe(false);
    saver.loaded(null);
    expect(saver.hasBody()).toBe(false);
    saver.markDirty();
    saver.flush();
    expect(saver.hasBody()).toBe(true);
    saver.loaded('');
    expect(saver.hasBody()).toBe(false);
    saver.loaded('{"store":{}}');
    expect(saver.hasBody()).toBe(true);
    body = '';
    saver.loaded(null);
    saver.markDirty();
    expect(saver.flush()).toBe(null); // an empty serialisation is "nothing to save"
    expect(saver.hasBody()).toBe(false);
  });

  it('a page that failed to load is never written, whatever the canvas does, until a page loads', () => {
    const { saver, serialize, emit, state } = setup();
    saver.failed('{broken');
    expect(saver.isBlocked()).toBe(true);
    state.body = 'blank page plus a stroke';
    saver.markDirty();
    expect(saver.hasPending()).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(saver.flush()).toBe(null);
    expect(serialize).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    expect(saver.isOwn('{broken')).toBe(true); // handed back as content: not reloaded

    saver.loaded('v1'); // a page loaded: saving works again
    expect(saver.isBlocked()).toBe(false);
    state.body = 'v2';
    saver.markDirty();
    expect(saver.flush()).toBe('v2');
    expect(emit).toHaveBeenCalledWith('v2');
  });

  it('failed() drops a pending edit: it belonged to the page being replaced', () => {
    const { saver, emit, state } = setup();
    state.body = 'v1';
    saver.markDirty();
    saver.failed('{broken');
    vi.advanceTimersByTime(1000);
    expect(emit).not.toHaveBeenCalled();
  });
});
