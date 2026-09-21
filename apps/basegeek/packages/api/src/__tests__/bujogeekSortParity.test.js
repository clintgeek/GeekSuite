/**
 * The gateway's sort must agree with the frontend's canonical comparator.
 *
 * It did not, and the disagreement was visible: weekly, monthly and all-task
 * lists render in the GATEWAY's order on load and are re-sorted by the
 * canonical comparator on the first mutation, so the list reordered itself
 * the moment the user ticked anything on it.
 *
 * These cases are named after DOCS/SORTING_RULES.md and mirror the frontend's
 * own taskSort tests, so the two suites fail on the same things if either
 * side drifts again.
 */
import taskService from '../graphql/bujogeek/services/taskService.js';

const task = (over) => ({ status: 'pending', priority: null, dueDate: null, ...over });
const order = (list) => taskService.sortTasks([...list]).map((t) => t.content);

describe('priority runs High to Low, not backwards', () => {
  it('orders undated tasks High, Medium, Low, None', () => {
    // The bug: `(b.priority) - (a.priority)` is descending, and 1 is High —
    // so Low sorted above High. The same mistake TaskList.jsx records having
    // fixed on the client, still alive on the server.
    const tasks = [
      task({ content: 'none' }),
      task({ content: 'low', priority: 3 }),
      task({ content: 'high', priority: 1 }),
      task({ content: 'medium', priority: 2 }),
    ];
    expect(order(tasks)).toEqual(['high', 'medium', 'low', 'none']);
  });

  it('breaks a tie between two dated tasks on priority', () => {
    // The spec says scheduled tasks are sorted by priority; this copy applied
    // no priority tiebreak to dated tasks at all.
    const day = '2026-09-20T09:00:00.000Z';
    const tasks = [
      task({ content: 'low', priority: 3, dueDate: day }),
      task({ content: 'high', priority: 1, dueDate: day }),
    ];
    expect(order(tasks)).toEqual(['high', 'low']);
  });
});

describe('only completed and cancelled sink', () => {
  it('keeps migrated tasks above completed work', () => {
    // `status !== 'pending'` sank migrated_back and migrated_future too.
    const tasks = [
      task({ content: 'done', status: 'completed' }),
      task({ content: 'migrated', status: 'migrated_future' }),
      task({ content: 'pending' }),
    ];
    const result = order(tasks);
    expect(result.indexOf('migrated')).toBeLessThan(result.indexOf('done'));
    expect(result[result.length - 1]).toBe('done');
  });

  it('puts cancelled below completed', () => {
    const tasks = [
      task({ content: 'cancelled', status: 'cancelled' }),
      task({ content: 'completed', status: 'completed' }),
      task({ content: 'pending' }),
    ];
    expect(order(tasks)).toEqual(['pending', 'completed', 'cancelled']);
  });
});

describe('scheduled before unscheduled, among incomplete tasks', () => {
  it('puts a dated task above an undated one of the same priority', () => {
    const tasks = [
      task({ content: 'undated', priority: 2 }),
      task({ content: 'dated', priority: 2, dueDate: '2026-09-20T09:00:00.000Z' }),
    ];
    expect(order(tasks)).toEqual(['dated', 'undated']);
  });

  it('sorts two dated tasks of equal priority by date, earliest first', () => {
    const tasks = [
      task({ content: 'later', dueDate: '2026-09-25T09:00:00.000Z' }),
      task({ content: 'earlier', dueDate: '2026-09-20T09:00:00.000Z' }),
    ];
    expect(order(tasks)).toEqual(['earlier', 'later']);
  });
});

describe('degenerate input does not scramble the list', () => {
  it('treats an unparseable dueDate as undated rather than NaN-comparing', () => {
    const tasks = [
      task({ content: 'broken', dueDate: 'not-a-date' }),
      task({ content: 'real', dueDate: '2026-09-20T09:00:00.000Z' }),
    ];
    expect(order(tasks)).toEqual(['real', 'broken']);
  });

  it('treats a zero or negative priority as None', () => {
    const tasks = [
      task({ content: 'zero', priority: 0 }),
      task({ content: 'low', priority: 3 }),
    ];
    expect(order(tasks)).toEqual(['low', 'zero']);
  });
});
