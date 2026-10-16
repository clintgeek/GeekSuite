/**
 * useFoodLogging — logging a thing, and taking it back.
 *
 * The box logs on a tap rather than staging-then-committing, which is only
 * honest if undo is real. These cases are mostly about the ids: every write
 * has to hand back what it wrote, and the caller has to be able to tell which
 * ids came from which item.
 *
 * Both bugs pinned here shipped and went unnoticed because nothing exercised
 * a saved meal:
 *
 *   1. A meal's log ids were thrown away — `addMealToLog` has always returned
 *      them — so logging a meal produced nothing to undo and the toast came up
 *      without its button.
 *   2. Callers paired items to ids by index, which is correct only while every
 *      item writes exactly one log. A meal writes several, so every item after
 *      a meal took an id belonging to the meal, and undoing a row deleted
 *      somebody else's food.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const addFoodToLog = vi.fn();
const addMealToLog = vi.fn();
const deleteFoodLog = vi.fn();
const describeApi = vi.fn();

vi.mock('../../services/fitnessGeekService.js', () => ({
  fitnessGeekService: {
    addFoodToLog: (...a) => addFoodToLog(...a),
    addMealToLog: (...a) => addMealToLog(...a),
    deleteFoodLog: (...a) => deleteFoodLog(...a)
  }
}));

vi.mock('../../services/foodService.js', () => ({
  foodService: { describe: (...a) => describeApi(...a), create: vi.fn() }
}));

vi.mock('../../utils/logger.js', () => ({
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() }
}));

const forgetRecentLogs = vi.fn();
vi.mock('../useRecentLogs.js', () => ({ forgetRecentLogs: (...a) => forgetRecentLogs(...a) }));

const { useFoodLogging } = await import('../useFoodLogging.js');

const food = (name) => ({ id: name, name, servings: 1, nutrition: { calories_per_serving: 100 } });
const meal = (id) => ({ type: 'meal', _id: id, name: 'Taco night' });

beforeEach(() => {
  vi.clearAllMocks();
  addFoodToLog.mockImplementation(async () => ({ success: true, data: { id: 'log-food' } }));
  deleteFoodLog.mockResolvedValue({ success: true });
});

const mount = () => renderHook(() => useFoodLogging({ date: '2026-09-16', onChanged: vi.fn() }));

describe('logging a saved meal', () => {
  it('hands back every log the meal wrote, so undo has something to delete', async () => {
    addMealToLog.mockResolvedValue({
      success: true,
      data: { logs: [{ _id: 'm1' }, { _id: 'm2' }, { _id: 'm3' }], logsCreated: 3 }
    });

    const { result } = mount();
    let out;
    await act(async () => { out = await result.current.logItems([meal('taco')], 'dinner'); });

    expect(out.logIds).toEqual(['m1', 'm2', 'm3']);
    expect(out.ok).toBe(1);
  });

  it('groups the ids by the item that wrote them', async () => {
    // The bug this replaces: a flat list plus index pairing meant the food
    // logged after a meal was credited with one of the meal's ids.
    addMealToLog.mockResolvedValue({
      success: true, data: { logs: [{ _id: 'm1' }, { _id: 'm2' }], logsCreated: 2 }
    });
    addFoodToLog.mockResolvedValue({ success: true, data: { id: 'f1' } });

    const { result } = mount();
    let out;
    await act(async () => {
      out = await result.current.logItems([meal('taco'), food('Apple')], 'dinner');
    });

    expect(out.perItem).toEqual([['m1', 'm2'], ['f1']]);
    // ...and the flat list is still every id, which is what a bulk undo needs.
    expect(out.logIds).toEqual(['m1', 'm2', 'f1']);
  });

  it('accepts either id spelling the API returns', async () => {
    addMealToLog.mockResolvedValue({
      success: true, data: { logs: [{ id: 'a' }, { _id: 'b' }, {}], logsCreated: 3 }
    });
    const { result } = mount();
    let out;
    await act(async () => { out = await result.current.logItems([meal('m')], 'dinner'); });
    expect(out.logIds).toEqual(['a', 'b']);   // the id-less row is dropped, not undefined
  });
});

describe('a failed item does not shift everyone else’s ids', () => {
  it('keeps the groups aligned with the items when one throws', async () => {
    addFoodToLog
      .mockResolvedValueOnce({ success: false, error: { message: 'nope' } })
      .mockResolvedValueOnce({ success: true, data: { id: 'f2' } });

    const { result } = mount();
    let out;
    await act(async () => {
      out = await result.current.logItems([food('Bad'), food('Good')], 'snack');
    });

    expect(out.fail).toBe(1);
    expect(out.ok).toBe(1);
    expect(out.perItem).toEqual([[], ['f2']]);
  });
});

describe('undo', () => {
  it('deletes exactly the ids it is given', async () => {
    const { result } = mount();
    await act(async () => { await result.current.undoLogs(['x', 'y']); });
    expect(deleteFoodLog).toHaveBeenCalledTimes(2);
    expect(deleteFoodLog).toHaveBeenCalledWith('x');
    expect(deleteFoodLog).toHaveBeenCalledWith('y');
  });

  it('does nothing when there is nothing to undo', async () => {
    const { result } = mount();
    await act(async () => { await result.current.undoLogs([]); });
    expect(deleteFoodLog).not.toHaveBeenCalled();
  });
});

describe('describeMeal', () => {
  it('reports what was written and what the rails refused', async () => {
    describeApi.mockResolvedValue({
      logged: [{ logId: 'd1', name: 'Nachos', calories: 1150 }],
      skipped: [{ name: 'Beef flautas', reason: 'portion-insane' }],
      logIds: ['d1'],
      questions: [],
      totalCalories: 1150
    });

    const { result } = mount();
    let out;
    await act(async () => { out = await result.current.describeMeal('nachos and 41 flautas'); });

    expect(out.ok).toBe(1);
    expect(out.fail).toBe(1);
    expect(out.logIds).toEqual(['d1']);
    expect(out.skipped[0].name).toBe('Beef flautas');
  });

  it('sends the local hour, because the server runs UTC', async () => {
    describeApi.mockResolvedValue({ logged: [], skipped: [], logIds: [] });
    const { result } = mount();
    await act(async () => { await result.current.describeMeal('toast'); });

    expect(describeApi).toHaveBeenCalledWith('toast', expect.objectContaining({
      date: '2026-09-16',
      hour: expect.any(Number)
    }));
  });
});

/**
 * B7: a tap used to wait for `onChanged` — a whole page reload, nine calls on
 * Home — before it returned, so there was no feedback for 1–3 s and a second
 * tap logged it twice. The write returns when the WRITE is done; the reload
 * follows on its own.
 */
describe('feedback first, refresh after', () => {
  const never = () => new Promise(() => {});

  it('logItems answers without waiting for the page to reload', async () => {
    const onChanged = vi.fn(never);
    const { result } = renderHook(() => useFoodLogging({ date: '2026-10-16', onChanged }));
    let out;
    await act(async () => { out = await result.current.logItems([food('Egg')], 'breakfast'); });
    expect(out.ok).toBe(1);
    expect(onChanged).toHaveBeenCalledTimes(1);   // still refreshed, just not awaited
  });

  it('describeMeal and undoLogs do not wait for it either', async () => {
    describeApi.mockResolvedValue({ logged: [{ logId: 'd1', name: 'Fries' }], skipped: [], logIds: ['d1'] });
    const onChanged = vi.fn(never);
    const { result } = renderHook(() => useFoodLogging({ date: '2026-10-16', onChanged }));
    let described;
    let undone;
    await act(async () => { described = await result.current.describeMeal('fries'); });
    await act(async () => { undone = await result.current.undoLogs(['d1']); });
    expect(described.ok).toBe(1);
    expect(undone.deleted).toEqual(['d1']);
  });

  it('a failed refresh does not turn a good write into an error', async () => {
    const onChanged = vi.fn().mockRejectedValue(new Error('502'));
    const { result } = renderHook(() => useFoodLogging({ date: '2026-10-16', onChanged }));
    let out;
    await act(async () => { out = await result.current.logItems([food('Egg')], 'breakfast'); });
    expect(out.ok).toBe(1);
  });

  it('drops the Again-chip cache after a log and after an undo', async () => {
    const { result } = mount();
    await act(async () => { await result.current.logItems([food('Egg')], 'breakfast'); });
    expect(forgetRecentLogs).toHaveBeenCalledTimes(1);
    await act(async () => { await result.current.undoLogs(['log-food']); });
    expect(forgetRecentLogs).toHaveBeenCalledTimes(2);
  });
});

/** B8: `allSettled` swallowed every failed delete, so a failed undo looked fine. */
describe('undo says what it could not do', () => {
  it('separates the logs that went from the ones that did not', async () => {
    deleteFoodLog
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error('Network Error'));
    const { result } = mount();
    let out;
    await act(async () => { out = await result.current.undoLogs(['a', 'b']); });
    expect(out).toEqual({ deleted: ['a'], failed: ['b'] });
  });
});

/** C2: one Idempotency-Key per press, so a retried timeout is not a second log. */
describe('describe idempotency', () => {
  it('passes the press’s key through', async () => {
    describeApi.mockResolvedValue({ logged: [], skipped: [], logIds: [] });
    const { result } = mount();
    await act(async () => { await result.current.describeMeal('toast', { idempotencyKey: 'key-1' }); });
    expect(describeApi).toHaveBeenCalledWith('toast', expect.objectContaining({ idempotencyKey: 'key-1' }));
  });

  it('makes one when the caller did not', async () => {
    describeApi.mockResolvedValue({ logged: [], skipped: [], logIds: [] });
    const { result } = mount();
    await act(async () => { await result.current.describeMeal('toast'); });
    expect(describeApi.mock.calls[0][1].idempotencyKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
