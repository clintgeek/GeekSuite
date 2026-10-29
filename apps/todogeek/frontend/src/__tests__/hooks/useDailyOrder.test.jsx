/**
 * useDailyOrder — reads the saved order for a LOCAL day, saves optimistically,
 * and on a refusal goes back to what it was with a plain toast. A new day
 * reads its own (empty) order: tomorrow starts from the normal rule.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MockedProvider } from '@apollo/client/testing';

const toasts = [];
vi.mock('@geeksuite/ui', () => ({
  useToast: () => ({ notify: (message, opts) => { toasts.push({ message, ...opts }); return toasts.length; }, dismiss: vi.fn() }),
}));

const { default: useDailyOrder, SAVE_FAILED } = await import('../../hooks/useDailyOrder');
const { GET_DAILY_TASK_ORDER } = await import('../../graphql/queries');
const { SAVE_DAILY_TASK_ORDER } = await import('../../graphql/mutations');

const read = (dateKey, ids) => ({
  request: { query: GET_DAILY_TASK_ORDER, variables: { dateKey } },
  result: { data: { dailyTaskOrder: ids } },
});
const saveOk = (dateKey, ids) => ({
  request: { query: SAVE_DAILY_TASK_ORDER, variables: { dateKey, orderedTaskIds: ids } },
  result: { data: { saveDailyTaskOrder: { __typename: 'SaveOrderResponse', success: true, updatedAt: '2026-10-29T10:00:00.000Z' } } },
});
const saveFails = (dateKey, ids) => ({
  request: { query: SAVE_DAILY_TASK_ORDER, variables: { dateKey, orderedTaskIds: ids } },
  error: new Error('network down'),
});

function mount(mocks, dateKey = '2026-10-29') {
  const wrapper = ({ children }) => <MockedProvider mocks={mocks} addTypename={false}>{children}</MockedProvider>;
  return renderHook(({ day }) => useDailyOrder(day), { wrapper, initialProps: { day: dateKey } });
}

beforeEach(() => { toasts.length = 0; });

describe('useDailyOrder', () => {
  it('reads the saved order for the day', async () => {
    const { result } = mount([read('2026-10-29', ['b', 'a'])]);
    expect(result.current.ids).toEqual([]);
    await waitFor(() => expect(result.current.ids).toEqual(['b', 'a']));
  });

  it('saves optimistically: the new order is there before the server answers', async () => {
    const { result } = mount([read('2026-10-29', ['a', 'b']), saveOk('2026-10-29', ['b', 'a'])]);
    await waitFor(() => expect(result.current.ids).toEqual(['a', 'b']));
    let done;
    act(() => { done = result.current.save(['b', 'a']); });
    expect(result.current.ids).toEqual(['b', 'a']);
    await act(async () => { expect(await done).toBe(true); });
    expect(result.current.ids).toEqual(['b', 'a']);
    expect(toasts).toEqual([]);
  });

  it('a refused save goes back and says so', async () => {
    const { result } = mount([read('2026-10-29', ['a', 'b']), saveFails('2026-10-29', ['b', 'a'])]);
    await waitFor(() => expect(result.current.ids).toEqual(['a', 'b']));
    let done;
    act(() => { done = result.current.save(['b', 'a']); });
    expect(result.current.ids).toEqual(['b', 'a']);
    await act(async () => { expect(await done).toBe(false); });
    expect(result.current.ids).toEqual(['a', 'b']);
    expect(toasts).toEqual([{ message: SAVE_FAILED, tone: 'error' }]);
    expect(SAVE_FAILED).toBe("Couldn't save the new order. Try again.");
  });

  it('a new day reads its own order, not yesterday’s', async () => {
    const { result, rerender } = mount([
      read('2026-10-29', ['a', 'b']),
      saveOk('2026-10-29', ['b', 'a']),
      read('2026-10-30', []),
    ]);
    await waitFor(() => expect(result.current.ids).toEqual(['a', 'b']));
    await act(async () => { await result.current.save(['b', 'a']); });
    rerender({ day: '2026-10-30' });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.ids).toEqual([]);
  });
});
