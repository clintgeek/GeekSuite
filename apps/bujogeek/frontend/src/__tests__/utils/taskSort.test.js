import { describe, it, expect } from 'vitest';
import { compareTasks, sortTasks } from '../../utils/taskSort.js';

const t = (over) => ({ status: 'pending', priority: null, dueDate: null, ...over });

const order = (tasks) => sortTasks(tasks).map((x) => x.id);

describe('compareTasks / sortTasks (SORTING_RULES.md)', () => {
  it('sinks completed and cancelled below incomplete', () => {
    const tasks = [
      t({ id: 'done', status: 'completed' }),
      t({ id: 'open', status: 'pending' }),
      t({ id: 'cancelled', status: 'cancelled' }),
    ];
    expect(order(tasks)).toEqual(['open', 'done', 'cancelled']);
  });

  it('orders cancelled after completed within the sunk group', () => {
    const tasks = [
      t({ id: 'cancelled', status: 'cancelled' }),
      t({ id: 'done', status: 'completed' }),
    ];
    expect(order(tasks)).toEqual(['done', 'cancelled']);
  });

  it('puts scheduled (dated) incomplete tasks before unscheduled', () => {
    const tasks = [
      t({ id: 'undated' }),
      t({ id: 'dated', dueDate: '2026-03-15T09:00:00.000Z' }),
    ];
    expect(order(tasks)).toEqual(['dated', 'undated']);
  });

  it('orders by priority High(1) → Medium(2) → Low(3) → None', () => {
    const tasks = [
      t({ id: 'none' }),
      t({ id: 'low', priority: 3 }),
      t({ id: 'high', priority: 1 }),
      t({ id: 'med', priority: 2 }),
    ];
    // all unscheduled + pending → pure priority order (regression: this was
    // once NaN-broken and did not sort at all)
    expect(order(tasks)).toEqual(['high', 'med', 'low', 'none']);
  });

  it('tiebreaks equal priority by earliest due date, undated last', () => {
    const tasks = [
      t({ id: 'later', priority: 1, dueDate: '2026-03-20T09:00:00.000Z' }),
      t({ id: 'earlier', priority: 1, dueDate: '2026-03-15T09:00:00.000Z' }),
    ];
    expect(order(tasks)).toEqual(['earlier', 'later']);
  });

  it('treats an invalid dueDate as unscheduled rather than throwing', () => {
    const tasks = [
      t({ id: 'bad', dueDate: 'not-a-date' }),
      t({ id: 'good', dueDate: '2026-03-15T09:00:00.000Z' }),
    ];
    expect(order(tasks)).toEqual(['good', 'bad']);
  });

  it('returns non-arrays untouched', () => {
    expect(sortTasks(null)).toBeNull();
    expect(sortTasks(undefined)).toBeUndefined();
  });
});
