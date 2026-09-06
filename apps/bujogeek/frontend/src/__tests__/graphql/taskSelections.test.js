import { describe, it, expect } from 'vitest';
import { print } from 'graphql';
import {
  GET_TASKS,
  GET_ALL_TASKS,
  GET_DAILY_TASKS,
  GET_WEEKLY_TASKS,
  GET_MONTHLY_TASKS,
  GET_BLOCKED_TASKS,
  GET_TASKS_BY_TAG,
  GET_COLLECTION,
} from '../../graphql/queries';
import { CREATE_TEMPLATE, UPDATE_TEMPLATE } from '../../graphql/mutations';

/**
 * A structural pin for a data-loss bug found in the 2026-09-05 going-over.
 *
 * `TaskEditor` seeds its form from whatever the task object carries and always
 * resends the collection and the recurrence frequency. The five log queries
 * selected neither `collectionId` nor `recurrenceRule`, so a task fetched by
 * Today / Review / Plan / Search / Tags arrived without them, the editor
 * seeded `collectionId: ''` and `recurrenceFreq: 'none'`, and saving *any*
 * unrelated field — a priority, a tag — posted `collectionId: null` and
 * `recurrenceRule: null`. The gateway obeyed: the entry was filed out of its
 * collection and the series demoted to a plain task
 * (`graphql/bujogeek/services/taskService.js` updateTask).
 *
 * The same four fields decide whether `TaskRow` draws the recurrence glyph and
 * whether `TaskContext.deleteTask` asks "this occurrence or the whole series?".
 * `GET_COLLECTION` and `GET_BLOCKED_TASKS` always had them, which is what made
 * the omission look like a rendering gap rather than a destructive one.
 *
 * This asserts the selection sets, not a rendered result, because that is
 * exactly where the bug lived — nothing throws when a field is missing.
 */

const TASK_QUERIES = {
  GET_TASKS,
  GET_ALL_TASKS,
  GET_DAILY_TASKS,
  GET_WEEKLY_TASKS,
  GET_MONTHLY_TASKS,
  GET_BLOCKED_TASKS,
  GET_TASKS_BY_TAG,
  GET_COLLECTION,
};

// Every field the editor round-trips or a row's chrome depends on.
const REQUIRED_TASK_FIELDS = [
  'collectionId',
  'recurrenceRule',
  'seriesId',
  'isSeriesMaster',
];

describe('task query selection sets', () => {
  it.each(Object.keys(TASK_QUERIES))(
    '%s selects every field TaskEditor resends',
    (name) => {
      const text = print(TASK_QUERIES[name]);
      for (const field of REQUIRED_TASK_FIELDS) {
        expect(text, `${name} is missing ${field}`).toContain(field);
      }
    }
  );
});

describe('template mutation payloads', () => {
  // TemplateContext splices these results straight into the list it renders.
  // Both used to return `{ id, name }`, so a newly created template had no
  // `content` and "Apply Template" on it produced zero tasks — TemplateApply
  // splits `template.content` into lines, and `undefined` has none.
  it.each([
    ['CREATE_TEMPLATE', CREATE_TEMPLATE],
    ['UPDATE_TEMPLATE', UPDATE_TEMPLATE],
  ])('%s returns the full card/apply shape', (_name, doc) => {
    const text = print(doc);
    for (const field of ['content', 'type', 'tags', 'description', 'isPublic']) {
      expect(text).toContain(field);
    }
  });
});
