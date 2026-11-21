/**
 * PenContext, 2026-11 (plan 1.6, 1.8/D3, 1.10, 1.12, 1.15, 3.18, 5.14).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';

const fake = {};
const toasts = [];

vi.mock('../../context/TaskContext.jsx', () => ({ useTaskContext: () => fake }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client');
  return { ...actual, useMutation: () => [vi.fn(() => Promise.resolve({}))] };
});
vi.mock('@geeksuite/ui', async () => ({
  // The real number: UNDO_MS is the suite's action-toast life.
  GEEK_TOAST_ACTION_DURATION: (await vi.importActual('@geeksuite/ui')).GEEK_TOAST_ACTION_DURATION,
  useToast: () => ({
    notify: (message, opts) => { toasts.push({ message, ...opts }); return toasts.length; },
    dismiss: vi.fn(),
  }),
  useReducedMotion: () => true,
}));

const { PenProvider, usePen, REFRESH_AFTER_MS, STALE_LIST_NOTE } = await import('../../context/PenContext.jsx');

function mount(overrides = {}) {
  fake.tasks = [];
  fake.error = null;
  fake.clearError = vi.fn();
  fake.skipEarlierOccurrences = vi.fn();
  fake.fetchTasks = vi.fn(() => Promise.resolve({ status: 'ok' }));
  fake.updateTaskStatus = vi.fn((id, status) => Promise.resolve({ id, status }));
  fake.updateTask = vi.fn((id, fields) => Promise.resolve({ id, ...fields }));
  fake.deleteTask = vi.fn(() => Promise.resolve(true));
  fake.createTask = vi.fn((input) => Promise.resolve({ id: 'new1', ...input }));
  Object.assign(fake, overrides);
  const ref = { current: null };
  const Probe = () => { ref.current = usePen(); return null; };
  const utils = render(<PenProvider><Probe /></PenProvider>);
  return { ref, ...utils };
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => { toasts.length = 0; });
afterEach(() => { vi.useRealTimers(); });

describe('a failed load is not "Nothing due today" (1.12)', () => {
  it('sets loadError and leaves loaded false', async () => {
    const { ref } = mount({ fetchTasks: vi.fn(() => Promise.resolve({ status: 'error', error: new Error('x') })) });
    await flush();
    expect(ref.current.loaded).toBe(false);
    expect(ref.current.loadError?.message).toMatch(/Couldn't reach your list/);
  });

  it('a Retry that works clears it', async () => {
    const fetchTasks = vi.fn()
      .mockResolvedValueOnce({ status: 'error', error: new Error('x') })
      .mockResolvedValueOnce({ status: 'ok' });
    const { ref } = mount({ fetchTasks });
    await flush();
    await act(async () => { await ref.current.refresh(); });
    expect(ref.current.loaded).toBe(true);
    expect(ref.current.loadError).toBeNull();
  });

  it('with nothing on screen, a failed load raises no toast: the page says it (review 2026-11-18 #10)', async () => {
    mount({ fetchTasks: vi.fn(() => Promise.resolve({ status: 'error', error: new Error('Service unavailable') })) });
    await flush();
    expect(toasts).toEqual([]);
  });

  it('with a list on screen, a failed re-read says so once, in plain words, not on every poll', async () => {
    const fetchTasks = vi.fn()
      .mockResolvedValueOnce({ status: 'ok' })
      .mockResolvedValue({ status: 'error', error: new Error('Service unavailable') });
    const { ref } = mount({ fetchTasks, tasks: [{ id: 't1', content: 'Water the plants', status: 'pending' }] });
    await flush();
    await act(async () => { await ref.current.refresh(); });
    await act(async () => { await ref.current.refresh(); });
    expect(toasts.map((t) => t.message)).toEqual([STALE_LIST_NOTE]);
    expect(toasts[0].tone).toBeUndefined();
  });

  it('TaskContext errors are said as a toast, once', async () => {
    mount({ error: { message: 'Failed to update task' } });
    await flush();
    expect(toasts.map((t) => t.message)).toContain('Failed to update task');
    expect(fake.clearError).toHaveBeenCalled();
  });
});

describe('other devices’ changes show up (5.14)', () => {
  it('window focus re-reads once the last read is old enough', async () => {
    const { ref } = mount();
    await flush();
    expect(fake.fetchTasks).toHaveBeenCalledTimes(1);
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(fake.fetchTasks).toHaveBeenCalledTimes(1); // throttled: just read
    const realNow = Date.now;
    Date.now = () => realNow() + REFRESH_AFTER_MS + 1000;
    try {
      act(() => { window.dispatchEvent(new Event('focus')); });
      await flush();
      expect(fake.fetchTasks).toHaveBeenCalledTimes(2);
    } finally {
      Date.now = realNow;
    }
    expect(ref.current.loaded).toBe(true);
  });

  it('coming back online re-reads', async () => {
    mount();
    await flush();
    const realNow = Date.now;
    Date.now = () => realNow() + 10000;
    try {
      act(() => { window.dispatchEvent(new Event('online')); });
      await flush();
      expect(fake.fetchTasks).toHaveBeenCalledTimes(2);
    } finally {
      Date.now = realNow;
    }
  });

  it('a visible tab re-reads by itself every few minutes', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    mount();
    await act(async () => { await Promise.resolve(); });
    const before = fake.fetchTasks.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(5 * 60 * 1000 + 10); });
    expect(fake.fetchTasks.mock.calls.length).toBeGreaterThan(before);
  });
});

describe('adding under a tag filter keeps the task in view (1.15)', () => {
  it('the active filter’s tag goes on the new task', async () => {
    const { ref } = mount();
    await flush();
    act(() => ref.current.setTagFilter('work'));
    expect(ref.current.pendingTag).toBe('work');
    await act(async () => { await ref.current.add({ content: 'call Dana', tags: ['home'] }); });
    expect(fake.createTask.mock.calls[0][0].tags).toEqual(['home', 'work']);
  });

  it('taken off, it is left off, and the toast says where the task went', async () => {
    const { ref } = mount();
    await flush();
    act(() => ref.current.setTagFilter('work'));
    act(() => ref.current.dismissPendingTag());
    expect(ref.current.pendingTag).toBeNull();
    await act(async () => { await ref.current.add({ content: 'call Dana' }); });
    expect(fake.createTask.mock.calls[0][0].tags).toBeUndefined();
    expect(toasts.at(-1).message).toBe('Added, not tagged #work.');
    expect(ref.current.pendingTag).toBe('work'); // back for the next one
  });
});

describe('a retried add is the same add (1.10, C1)', () => {
  it('a timeout is retried once with the same clientId', async () => {
    const timeout = Object.assign(new Error('slow'), { networkError: { name: 'TimeoutError', timeout: true } });
    const createTask = vi.fn()
      .mockRejectedValueOnce(timeout)
      .mockImplementationOnce((input) => Promise.resolve({ id: 'n', ...input }));
    const { ref } = mount({ createTask });
    await flush();
    await act(async () => { await ref.current.add({ content: 'buy milk' }); });
    expect(createTask).toHaveBeenCalledTimes(2);
    expect(createTask.mock.calls[1][0].clientId).toBe(createTask.mock.calls[0][0].clientId);
  });

  it('a server refusal is not retried', async () => {
    const refusal = Object.assign(new Error('bad'), { graphQLErrors: [{ extensions: { code: 'BAD_USER_INPUT' } }] });
    const createTask = vi.fn().mockRejectedValue(refusal);
    const { ref } = mount({ createTask });
    await flush();
    await act(async () => { await ref.current.add({ content: 'x' }); });
    expect(createTask).toHaveBeenCalledTimes(1);
  });

  it('sending the same line again after a failure reuses its clientId', async () => {
    const down = Object.assign(new Error('offline'), { networkError: { statusCode: 0 } });
    const createTask = vi.fn()
      .mockRejectedValueOnce(down).mockRejectedValueOnce(down)
      .mockImplementationOnce((input) => Promise.resolve({ id: 'n', ...input }));
    const { ref } = mount({ createTask });
    await flush();
    await act(async () => { await ref.current.add({ content: 'buy milk' }); });
    await act(async () => { await ref.current.add({ content: 'buy milk' }); });
    const sent = createTask.mock.calls.map((c) => c[0].clientId);
    expect(new Set(sent).size).toBe(1);
  });
});

describe('a repeating add (1.6)', () => {
  it('re-reads the list, and Undo takes the whole series', async () => {
    const { ref } = mount({ createTask: vi.fn((input) => Promise.resolve({ id: 'm1', isSeriesMaster: true, ...input })) });
    await flush();
    const before = fake.fetchTasks.mock.calls.length;
    await act(async () => { await ref.current.add({ content: 'vitamins', recurrenceRule: 'x' }, { where: 'tomorrow' }); });
    expect(fake.fetchTasks.mock.calls.length).toBe(before + 1);
    act(() => toasts.at(-1).action.props.onClick());
    expect(fake.deleteTask).toHaveBeenCalledWith('m1', 'ALL_INSTANCES');
  });
});

describe('ticking a late repeat skips the misses behind it (D3)', () => {
  it('asks TaskContext to drop the earlier occurrences', async () => {
    const { ref } = mount();
    await flush();
    const late = { id: 'virtual_m1_1', seriesId: 'm1', status: 'pending', dueDate: '2026-01-02T15:00:00.000Z' };
    await act(async () => { await ref.current.toggleDone(late); });
    expect(fake.skipEarlierOccurrences).toHaveBeenCalledWith('m1', late.dueDate);
  });

  it('a future occurrence ticked early does not', async () => {
    const { ref } = mount();
    await flush();
    const future = { id: 'virtual_m1_2', seriesId: 'm1', status: 'pending', dueDate: new Date(Date.now() + 86400000).toISOString() };
    await act(async () => { await ref.current.toggleDone(future); });
    expect(fake.skipEarlierOccurrences).not.toHaveBeenCalled();
  });
});

describe('moves are optimistic, and "Move all" goes out at once (3.18)', () => {
  it('every write is sent before any answer comes back', async () => {
    const pending = [];
    const updateTask = vi.fn((id) => new Promise((resolve) => { pending.push(() => resolve({ id })); }));
    const { ref } = mount({ updateTask });
    await flush();
    const list = [
      { id: 'a', dueDate: '2026-11-01T00:00:00.000Z' },
      { id: 'b', dueDate: '2026-11-02T00:00:00.000Z' },
      { id: 'c', dueDate: '2026-11-03T00:00:00.000Z' },
    ];
    let done;
    await act(async () => {
      done = ref.current.moveAllToToday(list);
      await Promise.resolve();
    });
    expect(updateTask).toHaveBeenCalledTimes(3);
    expect(updateTask.mock.calls.every((c) => c[3]?.optimistic === true)).toBe(true);
    await act(async () => { pending.forEach((r) => r()); await done; });
    expect(toasts.at(-1).message).toBe('Moved 3 to today.');
  });

  it('a single move is optimistic', async () => {
    const { ref } = mount();
    await flush();
    await act(async () => { await ref.current.moveToTomorrow({ id: 'a', dueDate: '2026-11-01T00:00:00.000Z' }); });
    expect(fake.updateTask.mock.calls[0][3]).toEqual({ optimistic: true });
  });
});
