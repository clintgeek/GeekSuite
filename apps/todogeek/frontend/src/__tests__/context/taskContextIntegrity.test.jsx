/**
 * TaskContext data integrity, 2026-11 (plan 1.1, 1.6, 1.9, 1.10, 1.12, 1.21,
 * 3.18): reads never overwrite newer writes, an empty answer is asked twice,
 * creates are idempotent and time-limited, status changes for one task are
 * applied in order, and moves are optimistic.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';

const mutate = vi.fn();
const query = vi.fn();

vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client');
  return {
    ...actual,
    useApolloClient: () => ({ mutate: (...a) => mutate(...a), query: (...a) => query(...a) }),
  };
});

const { TaskProvider, useTaskContext, WRITE_TIMEOUT_MS } = await import('../../context/TaskContext');

let api;
function Probe() {
  api = useTaskContext();
  return null;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

function mount() {
  render(<TaskProvider><Probe /></TaskProvider>);
}

const all = (list) => ({ data: { allTasks: list } });
const ids = () => api.tasks.map((t) => t.id);

beforeEach(() => {
  vi.clearAllMocks();
  mutate.mockReset();
  query.mockReset();
});

describe('a read that overlapped a write is read again (1.9)', () => {
  it('a slow allTasks that started before an add does not erase the add', async () => {
    mount();
    const slow = deferred();
    query
      .mockImplementationOnce(() => slow.promise) // started before the add
      .mockResolvedValueOnce(all([{ id: 'old' }, { id: 'new1', content: 'typed' }]));
    mutate.mockResolvedValueOnce({ data: { createTask: { id: 'new1', content: 'typed', isSeriesMaster: false } } });

    let fetched;
    await act(async () => {
      fetched = api.fetchTasks('year');
      await api.createTask({ content: 'typed', dueDate: '2026-11-15' });
      slow.resolve(all([{ id: 'old' }])); // the list from before the add
      await fetched;
    });
    expect(ids()).toContain('new1');
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('an older read is dropped when a newer one started', async () => {
    mount();
    const first = deferred();
    query.mockImplementationOnce(() => first.promise).mockResolvedValueOnce(all([{ id: 'fresh' }]));
    let a;
    let b;
    await act(async () => {
      a = api.fetchTasks('year');
      await flush();
      b = api.fetchTasks('year');
      await b;
      first.resolve(all([{ id: 'stale' }]));
      await a;
    });
    expect(await a).toEqual({ status: 'superseded' });
    expect(ids()).toEqual(['fresh']);
  });
});

describe('a doubtful empty answer is asked again (1.12)', () => {
  it('a non-empty list is not emptied by one empty answer', async () => {
    mount();
    query.mockResolvedValueOnce(all([{ id: 'a' }]));
    await act(async () => { await api.fetchTasks('year'); });
    query.mockResolvedValueOnce(all([])).mockResolvedValueOnce(all([{ id: 'a' }, { id: 'b' }]));
    await act(async () => { await api.fetchTasks('year'); });
    expect(ids()).toEqual(['a', 'b']);
  });

  it('two empty answers in a row are believed', async () => {
    mount();
    query.mockResolvedValueOnce(all([{ id: 'a' }]));
    await act(async () => { await api.fetchTasks('year'); });
    query.mockResolvedValue(all([]));
    await act(async () => { await api.fetchTasks('year'); });
    expect(ids()).toEqual([]);
  });

  it('a failed read says so and leaves the list alone', async () => {
    mount();
    query.mockResolvedValueOnce(all([{ id: 'a' }]));
    await act(async () => { await api.fetchTasks('year'); });
    query.mockRejectedValueOnce(Object.assign(new Error('down'), { networkError: { statusCode: 502 } }));
    let result;
    await act(async () => { result = await api.fetchTasks('year'); });
    expect(result.status).toBe('error');
    expect(ids()).toEqual(['a']);
  });
});

describe('createTask (C1, C2, 1.6)', () => {
  it('sends a clientId, a 15 s timeout and an explicit hasDueTime', async () => {
    mount();
    mutate.mockResolvedValueOnce({ data: { createTask: { id: 'n', content: 'x' } } });
    await act(async () => { await api.createTask({ content: 'x', dueDate: '2026-11-21' }); });
    const call = mutate.mock.calls[0][0];
    expect(call.variables.clientId).toMatch(/\S{8,}/);
    expect(call.variables.hasDueTime).toBe(false);
    expect(call.context).toEqual({ timeoutMs: WRITE_TIMEOUT_MS });
    expect(WRITE_TIMEOUT_MS).toBe(15000);
  });

  it('a timed value at exactly UTC midnight goes out flagged, and one second later', async () => {
    mount();
    mutate.mockResolvedValueOnce({ data: { createTask: { id: 'n', content: 'x' } } });
    await act(async () => { await api.createTask({ content: 'x', dueDate: '2026-11-21T00:00:00.000Z' }); });
    const { variables } = mutate.mock.calls[0][0];
    expect(variables.hasDueTime).toBe(true);
    expect(variables.dueDate).toBe('2026-11-21T00:00:01.000Z');
  });

  it('keeps the caller’s clientId (a retry), and a replayed answer is not added twice', async () => {
    mount();
    mutate.mockResolvedValue({ data: { createTask: { id: 'same', content: 'x' } } });
    await act(async () => {
      await api.createTask({ content: 'x', clientId: 'cid-1' });
      await api.createTask({ content: 'x', clientId: 'cid-1' });
    });
    expect(mutate.mock.calls.map((c) => c[0].variables.clientId)).toEqual(['cid-1', 'cid-1']);
    expect(ids()).toEqual(['same']);
  });

  it('a failed create carries its clientId for the retry', async () => {
    mount();
    mutate.mockRejectedValueOnce(new Error('offline'));
    let caught;
    await act(async () => {
      try { await api.createTask({ content: 'x' }); } catch (e) { caught = e; }
    });
    expect(caught.clientId).toBe(mutate.mock.calls[0][0].variables.clientId);
  });

  it('a repeating task’s series master is not added as a row (1.6)', async () => {
    mount();
    mutate.mockResolvedValueOnce({ data: { createTask: { id: 'm', content: 'vitamins', isSeriesMaster: true } } });
    await act(async () => { await api.createTask({ content: 'vitamins', recurrenceRule: 'DTSTART:20261115T150000Z\nRRULE:FREQ=DAILY' }); });
    expect(ids()).toEqual([]);
    expect(mutate.mock.calls[0][0].variables.timeZone).toBeTruthy();
  });
});

describe('status changes for one task are applied in order (1.21)', () => {
  it('tick then un-tick: the screen ends where the last request did, whatever order answers arrive', async () => {
    mount();
    query.mockResolvedValueOnce(all([{ id: 't1', status: 'pending' }]));
    await act(async () => { await api.fetchTasks('year'); });

    const tick = deferred();
    const untick = deferred();
    mutate
      .mockImplementationOnce(() => tick.promise)
      .mockImplementationOnce(() => untick.promise);

    let a;
    let b;
    await act(async () => {
      a = api.updateTaskStatus('t1', 'completed');
      b = api.updateTaskStatus('t1', 'pending');
      await flush();
    });
    // The un-tick waits for the tick: only one request is out.
    expect(mutate).toHaveBeenCalledTimes(1);
    await act(async () => {
      tick.resolve({ data: { updateTaskStatus: { id: 't1', status: 'completed' } } });
      await a;
      await flush();
    });
    // The tick's (older) answer does not redraw the row as done while the
    // un-tick is still out.
    expect(api.tasks.find((t) => t.id === 't1').status).toBe('pending');
    await act(async () => {
      untick.resolve({ data: { updateTaskStatus: { id: 't1', status: 'pending' } } });
      await b;
    });
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(api.tasks.find((t) => t.id === 't1').status).toBe('pending');
  });

  it('the second request for a virtual occurrence uses the real id the first got', async () => {
    mount();
    query.mockResolvedValueOnce(all([{ id: 'virtual_m_1', status: 'pending', seriesId: 'm' }]));
    await act(async () => { await api.fetchTasks('year'); });
    const tick = deferred();
    mutate
      .mockImplementationOnce(() => tick.promise)
      .mockImplementationOnce(({ variables }) => Promise.resolve({ data: { updateTaskStatus: { id: variables.id, status: 'pending' } } }));
    let a;
    let b;
    await act(async () => {
      a = api.updateTaskStatus('virtual_m_1', 'completed');
      b = api.updateTaskStatus('virtual_m_1', 'pending');
      await flush();
      tick.resolve({ data: { updateTaskStatus: { id: 'real1', status: 'completed' } } });
      await a;
      await b;
    });
    expect(mutate.mock.calls[1][0].variables.id).toBe('real1');
    expect(api.tasks.map((t) => [t.id, t.status])).toEqual([['real1', 'pending']]);
  });
});

describe('optimistic moves (3.18)', () => {
  it('moves the row at once, and puts it back when the server says no', async () => {
    mount();
    query.mockResolvedValueOnce(all([{ id: 't1', status: 'pending', dueDate: '2026-11-10T00:00:00.000Z' }]));
    await act(async () => { await api.fetchTasks('year'); });
    const answer = deferred();
    mutate.mockImplementationOnce(() => answer.promise);
    let p;
    await act(async () => {
      p = api.updateTask('t1', { dueDate: '2026-11-15' }, 'THIS_INSTANCE', { optimistic: true }).catch(() => null);
      await flush();
    });
    expect(api.tasks[0].dueDate).toBe('2026-11-15T00:00:00.000Z');
    expect(api.tasks[0].hasDueTime).toBe(false);
    await act(async () => {
      answer.reject(new Error('refused'));
      await p;
    });
    expect(api.tasks[0].dueDate).toBe('2026-11-10T00:00:00.000Z');
  });
});
