/**
 * PenContext — every change offers an Undo that really undoes it; a delete is
 * deferred until the Undo window closes; the cross-off holds the row for the
 * strike, and not at all under reduced motion.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';

const fake = {};
const toasts = [];
let reduced = false;

vi.mock('../../context/TaskContext.jsx', () => ({ useTaskContext: () => fake }));
const USER = { id: 'u1' };
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { ...USER } }) }));
vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client');
  return { ...actual, useMutation: () => [vi.fn(() => Promise.resolve({}))] };
});
vi.mock('@geeksuite/ui', () => ({
  useToast: () => ({
    notify: (message, opts) => { toasts.push({ message, ...opts }); return toasts.length; },
    dismiss: vi.fn(),
  }),
  useReducedMotion: () => reduced,
}));

const { PenProvider, usePen, UNDO_MS, SETTLE_MS } = await import('../../context/PenContext.jsx');
const { dueDateOn } = await import('../../utils/penViews');

const task = (over = {}) => ({ id: 't1', content: 'Call Dana', status: 'pending', dueDate: '2026-09-29T00:00:00.000Z', ...over });

function mount(tasks = [task()], overrides = {}) {
  fake.tasks = tasks;
  fake.fetchTasks = vi.fn(() => Promise.resolve());
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

const lastUndo = () => toasts[toasts.length - 1].action.props.onClick;

beforeEach(() => { toasts.length = 0; reduced = false; });
afterEach(() => { vi.useRealTimers(); });

describe('Undo', () => {
  it('ticking offers Undo, and Undo restores the previous status', async () => {
    const { ref } = mount([task({ status: 'migrated_future' })]);
    await act(async () => { await ref.current.toggleDone(task({ status: 'migrated_future' })); });
    expect(fake.updateTaskStatus).toHaveBeenCalledWith('t1', 'completed');
    expect(toasts.at(-1).message).toBe('Done.');
    expect(toasts.at(-1).duration).toBe(UNDO_MS);
    act(() => lastUndo()());
    expect(fake.updateTaskStatus).toHaveBeenLastCalledWith('t1', 'migrated_future');
  });

  it('Undo acts on the id the server gave a repeat occurrence', async () => {
    const { ref } = mount([task({ id: 'virtual_m1_123' })], {
      updateTaskStatus: vi.fn(() => Promise.resolve({ id: 'real9', status: 'completed' })),
    });
    await act(async () => { await ref.current.toggleDone(task({ id: 'virtual_m1_123' })); });
    act(() => lastUndo()());
    expect(fake.updateTaskStatus).toHaveBeenLastCalledWith('real9', 'pending');
  });

  it('un-ticking from Done puts it back, and Undo re-completes it', async () => {
    const { ref } = mount([task({ status: 'completed' })]);
    await act(async () => { await ref.current.toggleDone(task({ status: 'completed' })); });
    expect(fake.updateTaskStatus).toHaveBeenCalledWith('t1', 'pending');
    expect(toasts.at(-1).message).toBe('Back on the list.');
    act(() => lastUndo()());
    expect(fake.updateTaskStatus).toHaveBeenLastCalledWith('t1', 'completed');
  });

  it('moving offers Undo, and Undo puts the old due date back', async () => {
    const { ref } = mount();
    await act(async () => { await ref.current.moveTo(task(), '2026-10-02', { label: 'Moved.' }); });
    expect(fake.updateTask).toHaveBeenCalledWith('t1', { dueDate: '2026-10-02' });
    act(() => lastUndo()());
    expect(fake.updateTask).toHaveBeenLastCalledWith('t1', { dueDate: '2026-09-29T00:00:00.000Z' });
  });

  it('"Move all to today" moves each, and one Undo restores each', async () => {
    const a = task({ id: 'a', dueDate: '2026-09-20T00:00:00.000Z' });
    const b = task({ id: 'b', dueDate: '2026-09-25T00:00:00.000Z' });
    const { ref } = mount([a, b]);
    let n;
    await act(async () => { n = await ref.current.moveAllToToday([a, b]); });
    expect(n).toBe(2);
    expect(fake.updateTask).toHaveBeenCalledTimes(2);
    expect(toasts.at(-1).message).toBe('Moved 2 to today.');
    act(() => lastUndo()());
    expect(fake.updateTask).toHaveBeenCalledWith('a', { dueDate: '2026-09-20T00:00:00.000Z' });
    expect(fake.updateTask).toHaveBeenCalledWith('b', { dueDate: '2026-09-25T00:00:00.000Z' });
  });
});

describe('deleting is deferred, so Undo loses nothing', () => {
  it('hides at once, and Undo inside the window means the server never hears of it', async () => {
    vi.useFakeTimers();
    const { ref } = mount();
    act(() => ref.current.remove(task()));
    expect(ref.current.corpus).toHaveLength(0);
    act(() => lastUndo()());
    expect(ref.current.corpus).toHaveLength(1);
    await act(async () => { vi.advanceTimersByTime(UNDO_MS + 10); });
    expect(fake.deleteTask).not.toHaveBeenCalled();
  });

  it('sends the delete when the window closes', async () => {
    vi.useFakeTimers();
    const { ref } = mount();
    act(() => ref.current.remove(task()));
    expect(fake.deleteTask).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(UNDO_MS + 10); });
    expect(fake.deleteTask).toHaveBeenCalledWith('t1', null);
  });
});

describe('the cross-off', () => {
  it('holds a ticked row in place for the strike, then lets it go', async () => {
    vi.useFakeTimers();
    const { ref } = mount();
    await act(async () => { await ref.current.toggleDone(task()); });
    expect(ref.current.settling.has('t1')).toBe(true);
    await act(async () => { vi.advanceTimersByTime(SETTLE_MS + 10); });
    expect(ref.current.settling.has('t1')).toBe(false);
  });

  it('is instant under prefers-reduced-motion: no hold at all', async () => {
    reduced = true;
    const { ref } = mount();
    await act(async () => { await ref.current.toggleDone(task()); });
    expect(ref.current.settling.size).toBe(0);
  });
});

describe('the tag filter', () => {
  it('a pinned tag filters every view\'s list, and clearing it brings everything back', () => {
    const { ref } = mount([task({ id: 'a', tags: ['work'] }), task({ id: 'b', tags: ['home'] }), task({ id: 'c', tags: ['Work'] })]);
    expect(ref.current.visible).toHaveLength(3);
    act(() => ref.current.setTagFilter('work'));
    expect(ref.current.visible.map((t) => t.id)).toEqual(['a', 'c']);
    expect(ref.current.corpus).toHaveLength(3);
    act(() => ref.current.setTagFilter(null));
    expect(ref.current.visible).toHaveLength(3);
  });
});

describe('dueDateOn', () => {
  it('keeps a date-only task date-only', () => {
    expect(dueDateOn(task(), '2026-10-01')).toBe('2026-10-01');
  });
  it('keeps a timed task\'s clock time on the new day', () => {
    const timed = task({ dueDate: new Date(2026, 8, 29, 14, 30).toISOString() });
    const moved = new Date(dueDateOn(timed, '2026-10-01'));
    expect([moved.getFullYear(), moved.getMonth(), moved.getDate(), moved.getHours(), moved.getMinutes()]).toEqual([2026, 9, 1, 14, 30]);
  });
});
