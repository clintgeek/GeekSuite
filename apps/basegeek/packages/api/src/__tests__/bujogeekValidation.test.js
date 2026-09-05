/**
 * bujogeekValidation.test.js
 *
 * Covers the zod input-validation gate in front of bujogeek's mutations
 * (SUITE_TODO's "input validation (Joi/Zod)" item, flagged there for
 * bujogeek's "client-controllable timestamps, unbounded strings"):
 *   1. Every validated mutation family accepts its normal input and rejects
 *      at least two kinds of bad input.
 *   2. Every rejection carries the same shape: a GraphQLError with
 *      `extensions.code = 'BAD_USER_INPUT'` and a `details` array.
 *   3. `toggleHabitLog`'s calendar-date field normalizes to UTC midnight,
 *      exactly like `habitService.toUtcMidnight` already does — this is a
 *      validation gate in front of an existing normalization, not a new one.
 *   4. `dueDate`-shaped instant fields are NOT collapsed to midnight — a
 *      task's due time can carry a real reminder hour (reminderService).
 *
 * This is a pure unit suite: no Mongo, no resolvers — just the schemas.
 */

import { GraphQLError } from 'graphql';
import {
  validateInput,
  createTaskSchema,
  updateTaskArgsSchema,
  addSubtaskArgsSchema,
  reorderSubtasksArgsSchema,
  createHabitArgsSchema,
  updateHabitArgsSchema,
  toggleHabitLogArgsSchema,
  createCollectionArgsSchema,
  updateCollectionArgsSchema,
  createJournalFromTemplateArgsSchema,
} from '../graphql/bujogeek/validation.js';

/** Assert a call throws the shared bujogeek validation error shape. */
function expectBadInput(fn) {
  let caught;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(GraphQLError);
  expect(caught.extensions.code).toBe('BAD_USER_INPUT');
  expect(Array.isArray(caught.extensions.details)).toBe(true);
  expect(caught.extensions.details.length).toBeGreaterThan(0);
  return caught;
}

describe('validateInput — shared error shape', () => {
  test('a rejection is a GraphQLError with extensions.code and details', () => {
    const validate = validateInput(createCollectionArgsSchema);
    const err = expectBadInput(() => validate({ name: '' }));
    expect(err.extensions.details[0]).toHaveProperty('path');
    expect(err.extensions.details[0]).toHaveProperty('message');
  });

  test('valid input passes through unchanged (no injected keys)', () => {
    const validate = validateInput(updateTaskArgsSchema);
    const out = validate({ id: 'abc', input: { content: 'c' } });
    expect(out).toEqual({ id: 'abc', input: { content: 'c' } });
  });
});

describe('createTask', () => {
  const validate = validateInput(createTaskSchema);

  test('accepts a normal create', () => {
    const out = validate({
      content: 'water plants',
      signifier: '@',
      priority: 2,
      tags: ['home', 'garden'],
      dueDate: '2026-03-15T09:00:00.000Z',
      recurrencePattern: 'weekly',
    });
    expect(out.content).toBe('water plants');
    expect(out.tags).toEqual(['home', 'garden']);
    // An instant dueDate keeps its time-of-day — it is not a calendar field.
    expect(out.dueDate.toISOString()).toBe('2026-03-15T09:00:00.000Z');
  });

  test('rejects empty content', () => {
    expectBadInput(() => validate({ content: '   ' }));
  });

  test('rejects a signifier outside the model enum', () => {
    expectBadInput(() => validate({ content: 'x', signifier: '§' }));
  });

  test('rejects an unknown field', () => {
    expectBadInput(() => validate({ content: 'x', bogus: true }));
  });

  test('rejects a dueDate before the year 2000', () => {
    expectBadInput(() => validate({ content: 'x', dueDate: '1999-12-31' }));
  });

  test('rejects a dueDate more than 10 years out', () => {
    const farFuture = new Date();
    farFuture.setUTCFullYear(farFuture.getUTCFullYear() + 11);
    expectBadInput(() => validate({ content: 'x', dueDate: farFuture }));
  });
});

describe('updateTask', () => {
  const validate = validateInput(updateTaskArgsSchema);

  test('accepts a partial update, including an empty input object', () => {
    expect(validate({ id: 'abc', input: {} })).toEqual({ id: 'abc', input: {} });
    const out = validate({ id: 'abc', input: { priority: 3 }, editScope: 'ALL_INSTANCES' });
    expect(out.editScope).toBe('ALL_INSTANCES');
  });

  test('rejects an unknown key inside input', () => {
    expectBadInput(() => validate({ id: 'abc', input: { taskType: 'task' } }));
  });

  test('rejects an out-of-range priority', () => {
    expectBadInput(() => validate({ id: 'abc', input: { priority: 7 } }));
  });

  test('does not force a dueDate carrying a time-of-day to midnight', () => {
    const out = validate({ id: 'abc', input: { dueDate: new Date('2026-03-15T14:29:00.000Z') } });
    expect(out.input.dueDate.toISOString()).toBe('2026-03-15T14:29:00.000Z');
  });
});

describe('addSubtask', () => {
  const validate = validateInput(addSubtaskArgsSchema);

  test('accepts a normal subtask', () => {
    const out = validate({ parentId: 'parent-1', content: 'Buy the paint', priority: 2, tags: ['house'] });
    expect(out.content).toBe('Buy the paint');
  });

  test('rejects empty content', () => {
    expectBadInput(() => validate({ parentId: 'parent-1', content: '' }));
  });

  test('rejects tags that are not an array', () => {
    expectBadInput(() => validate({ parentId: 'parent-1', content: 'x', tags: 'not-an-array' }));
  });
});

describe('reorderSubtasks', () => {
  const validate = validateInput(reorderSubtasksArgsSchema);

  test('accepts an empty list', () => {
    expect(validate({ parentId: 'p1', orderedSubtaskIds: [] })).toEqual({
      parentId: 'p1',
      orderedSubtaskIds: [],
    });
  });

  test('rejects a missing parentId', () => {
    expectBadInput(() => validate({ orderedSubtaskIds: ['a'] }));
  });

  test('rejects a non-array orderedSubtaskIds', () => {
    expectBadInput(() => validate({ parentId: 'p1', orderedSubtaskIds: 'a' }));
  });
});

describe('createHabit', () => {
  const validate = validateInput(createHabitArgsSchema);

  test('accepts a schedule with out-of-range/duplicate days — the service normalizes them', () => {
    const out = validate({ name: '  Morning pages  ', daysOfWeek: [5, 1, 1, 9, -2] });
    expect(out.name).toBe('Morning pages');
    expect(out.daysOfWeek).toEqual([5, 1, 1, 9, -2]);
  });

  test('rejects an empty name', () => {
    expectBadInput(() => validate({ name: '' }));
  });

  test('rejects a daysOfWeek entry that is not a number', () => {
    expectBadInput(() => validate({ name: 'Water', daysOfWeek: ['Monday'] }));
  });
});

describe('updateHabit', () => {
  const validate = validateInput(updateHabitArgsSchema);

  test('accepts renaming and archiving', () => {
    const out = validate({ id: 'not-an-objectid', name: 'Sit', archived: true });
    expect(out.name).toBe('Sit');
    expect(out.archived).toBe(true);
  });

  test('rejects a missing id', () => {
    expectBadInput(() => validate({ name: 'x' }));
  });

  test('rejects an oversized color value', () => {
    expectBadInput(() => validate({ id: 'h1', color: '#'.repeat(64) }));
  });
});

describe('toggleHabitLog', () => {
  const validate = validateInput(toggleHabitLogArgsSchema);

  test('a bare calendar date normalizes to UTC midnight', () => {
    const out = validate({ habitId: 'h1', date: '2026-01-05' });
    expect(out.date.toISOString()).toBe('2026-01-05T00:00:00.000Z');
  });

  test('a date carrying a time component is ALSO normalized to UTC midnight — habitLog has no time-of-day', () => {
    const out = validate({ habitId: 'h1', date: '2026-01-05T17:42:11.000Z' });
    expect(out.date.toISOString()).toBe('2026-01-05T00:00:00.000Z');
  });

  test('rejects an unparseable date', () => {
    expectBadInput(() => validate({ habitId: 'h1', date: 'not-a-date' }));
  });

  test('rejects a date before the year 2000', () => {
    expectBadInput(() => validate({ habitId: 'h1', date: '1999-06-01' }));
  });
});

describe('createCollection', () => {
  const validate = validateInput(createCollectionArgsSchema);

  test('accepts a normal collection', () => {
    const out = validate({ name: '  Gift Ideas  ', description: 'for the holidays' });
    expect(out.name).toBe('Gift Ideas');
  });

  test('rejects an empty name', () => {
    expectBadInput(() => validate({ name: '' }));
  });

  test('rejects an oversized description', () => {
    expectBadInput(() => validate({ name: 'x', description: 'a'.repeat(2001) }));
  });
});

describe('updateCollection', () => {
  const validate = validateInput(updateCollectionArgsSchema);

  test('accepts renaming and archiving', () => {
    const out = validate({ id: 'c1', name: 'Books, Reordered', archived: true });
    expect(out.archived).toBe(true);
  });

  test('rejects a missing id', () => {
    expectBadInput(() => validate({ name: 'x' }));
  });

  test('rejects an unknown field', () => {
    expectBadInput(() => validate({ id: 'c1', bogus: 1 }));
  });
});

describe('createJournalFromTemplate', () => {
  const validate = validateInput(createJournalFromTemplateArgsSchema);

  test('accepts a templateId with no date', () => {
    const out = validate({ templateId: 't1' });
    expect(out.templateId).toBe('t1');
    expect(out.date).toBeUndefined();
  });

  test('rejects a missing templateId', () => {
    expectBadInput(() => validate({ date: '2026-01-05' }));
  });

  test('rejects a date more than 10 years out', () => {
    const farFuture = new Date();
    farFuture.setUTCFullYear(farFuture.getUTCFullYear() + 11);
    expectBadInput(() => validate({ templateId: 't1', date: farFuture }));
  });
});
