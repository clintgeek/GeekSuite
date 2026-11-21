import { afterEach, describe, expect, it, vi } from 'vitest';
import { DayNoteStore, RETRY_DELAYS_MS } from '../../store/dayNoteStore.js';

describe('DayNoteStore with the default timers', () => {
  afterEach(() => vi.unstubAllGlobals());

  // Found in the browser (2026-11-20): the defaults were the bare functions, and
  // `this.setTimer(...)` on a store threw "Illegal invocation" on the first failed save.
  it('schedules its retry without the store as `this`, as a browser requires', async () => {
    const scheduled = [];
    vi.stubGlobal('setTimeout', function browserSetTimeout(fn, ms) {
      if (this instanceof DayNoteStore) throw new TypeError('Illegal invocation');
      scheduled.push({ fn, ms });
      return scheduled.length;
    });
    const saves = [];
    const client = {
      query: async () => ({ data: { notes: [{ id: 'n1', content: 'a', updatedAt: 'u0', createdAt: '2026-11-20T08:00:00Z' }] } }),
      mutate: async ({ variables }) => {
        saves.push(variables.content);
        if (saves.length === 1) throw new Error('network');
        return { data: { updateNote: { id: 'n1', updatedAt: 'u1' } } };
      },
    };
    const store = new DayNoteStore({ client, dayKey: '2026-11-20' });
    await store.load();
    store.write('b');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(store.getState().save).toBe('error');
    expect(scheduled.map((t) => t.ms)).toEqual([RETRY_DELAYS_MS[0]]);
    scheduled[0].fn();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(saves).toEqual(['b', 'b']);
    expect(store.getState().save).toBe('saved');
  });
});
