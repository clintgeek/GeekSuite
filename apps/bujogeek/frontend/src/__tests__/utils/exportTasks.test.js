import { describe, it, expect } from 'vitest';
import { format } from 'date-fns';
import { tasksToJSON, tasksToMarkdown, exportFilename } from '../../utils/exportTasks';

// Local (not UTC) Date objects, so grouping/heading logic is not sensitive to
// the timezone the test happens to run in.
const localDate = (y, m, d) => new Date(y, m - 1, d, 9, 0, 0, 0);

describe('tasksToJSON', () => {
  it('pretty-prints the task list as JSON', () => {
    const tasks = [{ id: 1, content: 'Task A' }];
    expect(tasksToJSON(tasks)).toBe(JSON.stringify(tasks, null, 2));
  });

  it('handles an empty list', () => {
    expect(tasksToJSON([])).toBe('[]');
  });
});

describe('tasksToMarkdown', () => {
  const tasks = [
    { id: 2, content: 'Task A', signifier: '*', status: 'pending', dueDate: localDate(2026, 3, 16), priority: 2 },
    { id: 1, content: 'Task B', signifier: '*', status: 'completed', dueDate: localDate(2026, 3, 16), priority: 1 },
    { id: 3, content: 'Cancelled task', signifier: '*', status: 'cancelled', dueDate: localDate(2026, 3, 15), priority: 1, tags: ['work'] },
    { id: 4, content: 'Event', signifier: '@', status: 'pending', dueDate: localDate(2026, 3, 15) },
    { id: 5, content: 'Question', signifier: '?', status: 'pending', dueDate: null },
    { id: 6, content: 'Just a note', signifier: '-', status: 'pending', dueDate: null, note: 'extra detail' },
  ];

  const md = tasksToMarkdown(tasks);

  it('starts with the document header', () => {
    expect(md).toMatch(/^# BuJoGeek Export\n\n_Exported .+_\n\n/);
  });

  it('groups by due date in chronological order with undated last', () => {
    const heading15 = format(new Date('2026-03-15T00:00:00'), 'EEEE, MMMM d, yyyy');
    const heading16 = format(new Date('2026-03-16T00:00:00'), 'EEEE, MMMM d, yyyy');

    const idx15 = md.indexOf(`## ${heading15}`);
    const idx16 = md.indexOf(`## ${heading16}`);
    const idxUndated = md.indexOf('## No due date');

    expect(idx15).toBeGreaterThan(-1);
    expect(idx16).toBeGreaterThan(-1);
    expect(idxUndated).toBeGreaterThan(-1);
    expect(idx15).toBeLessThan(idx16);
    expect(idx16).toBeLessThan(idxUndated);
  });

  it('sorts items within a group by priority, ignoring completion status', () => {
    const heading16 = format(new Date('2026-03-16T00:00:00'), 'EEEE, MMMM d, yyyy');
    const section = md.slice(md.indexOf(`## ${heading16}`));
    // Task B (priority 1, completed) must precede Task A (priority 2, pending).
    expect(section.indexOf('Task B')).toBeLessThan(section.indexOf('Task A'));
  });

  it('renders a checked checkbox for completed actionable tasks', () => {
    expect(md).toContain('- [x] Task B');
  });

  it('renders an unchecked checkbox for pending actionable tasks', () => {
    expect(md).toContain('- [ ] Task A');
  });

  it('strikes through cancelled task content and keeps checkbox unchecked', () => {
    expect(md).toContain('- [ ] ~~Cancelled task~~ #work');
  });

  it('renders event and question signifiers as plain bullets, not checkboxes', () => {
    expect(md).toContain('- @ Event');
    expect(md).toContain('- ? Question');
  });

  it('renders a note-only signifier as a plain bullet', () => {
    expect(md).toContain('- Just a note');
  });

  it('renders an attached note as an indented line beneath its bullet', () => {
    expect(md).toContain('- Just a note\n    extra detail');
  });

  it('handles an empty task list without throwing', () => {
    expect(() => tasksToMarkdown([])).not.toThrow();
    expect(tasksToMarkdown([])).toContain('# BuJoGeek Export');
  });

  it('handles undefined/null input as an empty list', () => {
    expect(() => tasksToMarkdown(undefined)).not.toThrow();
    expect(() => tasksToMarkdown(null)).not.toThrow();
  });
});

describe('exportFilename', () => {
  it('builds a dated filename with the given extension', () => {
    expect(exportFilename('json')).toMatch(/^bujogeek-export-\d{4}-\d{2}-\d{2}\.json$/);
    expect(exportFilename('md')).toMatch(/^bujogeek-export-\d{4}-\d{2}-\d{2}\.md$/);
  });
});
