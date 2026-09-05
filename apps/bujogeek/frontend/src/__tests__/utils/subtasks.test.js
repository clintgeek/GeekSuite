import { describe, it, expect } from 'vitest';
import {
  subtaskProgress,
  hasSubtasks,
  allSubtasksComplete,
  splitNested,
  orderedSubtasks,
  reorderedSubtaskIds,
  parentCaption,
} from '../../utils/subtasks.js';

const task = (id, over = {}) => ({ id, content: `task ${id}`, status: 'pending', ...over });
const child = (id, parentId, over = {}) => task(id, { parentTask: { id: parentId, content: `task ${parentId}` }, ...over });

describe('subtaskProgress', () => {
  it('counts done out of total', () => {
    const parent = task('p', {
      subtasks: [
        task('a', { status: 'completed' }),
        task('b', { status: 'pending' }),
        task('c', { status: 'completed' }),
      ],
    });
    expect(subtaskProgress(parent)).toEqual({ done: 2, total: 3 });
  });

  it('counts a cancelled step toward the total but not toward done', () => {
    const parent = task('p', {
      subtasks: [task('a', { status: 'completed' }), task('b', { status: 'cancelled' })],
    });
    expect(subtaskProgress(parent)).toEqual({ done: 1, total: 2 });
  });

  it('is zero for a task with no steps, or a missing array', () => {
    expect(subtaskProgress(task('p'))).toEqual({ done: 0, total: 0 });
    expect(subtaskProgress(task('p', { subtasks: null }))).toEqual({ done: 0, total: 0 });
    expect(subtaskProgress(undefined)).toEqual({ done: 0, total: 0 });
    expect(hasSubtasks(task('p'))).toBe(false);
  });
});

describe('allSubtasksComplete', () => {
  it('is true only when there is at least one step and all are done', () => {
    expect(allSubtasksComplete(task('p'))).toBe(false);
    expect(allSubtasksComplete(task('p', { subtasks: [task('a', { status: 'pending' })] }))).toBe(false);
    expect(allSubtasksComplete(task('p', { subtasks: [task('a', { status: 'completed' })] }))).toBe(true);
  });

  it('a cancelled step is not a finished step — the parent is not offered', () => {
    const parent = task('p', {
      subtasks: [task('a', { status: 'completed' }), task('b', { status: 'cancelled' })],
    });
    expect(allSubtasksComplete(parent)).toBe(false);
  });
});

describe('splitNested', () => {
  it('folds a step away when its parent is on the same screen', () => {
    const parent = task('p');
    const step = child('s', 'p');
    const other = task('o');

    const { rows, nestedIds } = splitNested([parent, step, other]);
    expect(rows.map((t) => t.id)).toEqual(['p', 'o']);
    expect([...nestedIds]).toEqual(['s']);
  });

  it('keeps a step as its own row when its parent is NOT on this screen', () => {
    // The parent is filed in a collection, or due another day: the step is
    // still real work today and must not vanish.
    const orphan = child('s', 'elsewhere');
    const { rows, nestedIds } = splitNested([orphan, task('o')]);
    expect(rows.map((t) => t.id)).toEqual(['s', 'o']);
    expect(nestedIds.size).toBe(0);
  });

  it('leaves a list with no parent/child links entirely alone', () => {
    const list = [task('a'), task('b'), task('c')];
    const { rows, nestedIds } = splitNested(list);
    expect(rows).toEqual(list);
    expect(nestedIds.size).toBe(0);
  });

  it('handles the _id shape as well as id', () => {
    const parent = { _id: 'p', content: 'parent' };
    const step = { _id: 's', content: 'step', parentTask: { _id: 'p' } };
    const { rows } = splitNested([parent, step]);
    expect(rows).toHaveLength(1);
  });

  it('survives an empty or missing list', () => {
    expect(splitNested([]).rows).toEqual([]);
    expect(splitNested(undefined).rows).toEqual([]);
    expect(splitNested(null).rows).toEqual([]);
  });

  it('folds several steps of the same parent', () => {
    const list = [task('p'), child('s1', 'p'), child('s2', 'p'), child('s3', 'p')];
    const { rows, nestedIds } = splitNested(list);
    expect(rows.map((t) => t.id)).toEqual(['p']);
    expect(nestedIds.size).toBe(3);
  });
});

describe('reorderedSubtaskIds', () => {
  const parent = task('p', { subtasks: [task('a'), task('b'), task('c')] });

  it('moves a step up', () => {
    expect(reorderedSubtaskIds(parent, 2, 1)).toEqual(['a', 'c', 'b']);
  });

  it('moves a step down', () => {
    expect(reorderedSubtaskIds(parent, 0, 2)).toEqual(['b', 'c', 'a']);
  });

  it('is a no-op at the ends and for a move to itself', () => {
    expect(reorderedSubtaskIds(parent, 0, -1)).toEqual(['a', 'b', 'c']);
    expect(reorderedSubtaskIds(parent, 2, 3)).toEqual(['a', 'b', 'c']);
    expect(reorderedSubtaskIds(parent, 1, 1)).toEqual(['a', 'b', 'c']);
  });

  it('always returns the full list — a reorder never loses a row', () => {
    const ids = reorderedSubtaskIds(parent, 0, 2);
    expect([...ids].sort()).toEqual(['a', 'b', 'c']);
  });

  it('is empty for a task with no steps', () => {
    expect(reorderedSubtaskIds(task('p'), 0, 1)).toEqual([]);
    expect(orderedSubtasks(task('p'))).toEqual([]);
  });
});

describe('parentCaption', () => {
  it('names the parent entry', () => {
    expect(parentCaption(child('s', 'p'))).toBe('task p');
  });

  it('is null when there is no parent, or the parent has no content', () => {
    expect(parentCaption(task('t'))).toBeNull();
    expect(parentCaption({ id: 's', parentTask: { id: 'p', content: '   ' } })).toBeNull();
    expect(parentCaption(undefined)).toBeNull();
  });
});
