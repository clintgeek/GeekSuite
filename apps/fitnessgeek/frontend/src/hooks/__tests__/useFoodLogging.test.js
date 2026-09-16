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
