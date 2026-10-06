/**
 * TaskRow is memoised — DOCS/BUJOGEEK_REVIEW_2026-09.md §3.3.
 *
 * One checkbox tap used to re-render every row on Search/Backlog/Tags. With
 * unchanged task objects and stable handlers, only the row whose task changed
 * may render again.
 *
 * Render counting: every TaskRow render calls `domainInk` (the stale-aging
 * ink) at least once, so the spy's call count is a render counter.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { createBuJoTheme } from '../../theme/theme';

const inkSpy = vi.hoisted(() => vi.fn());
vi.mock('../../theme/inks', async () => {
  const actual = await vi.importActual('../../theme/inks');
  return {
    ...actual,
    domainInk: (...args) => {
      inkSpy();
      return actual.domainInk(...args);
    },
  };
});

vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client');
  return { ...actual, useMutation: () => [vi.fn(), { loading: false }] };
});

const { default: TaskRow } = await import('../../components/tasks/TaskRow');

const theme = createBuJoTheme('light');
const mk = (id, over = {}) => ({
  id,
  _id: id,
  content: `task ${id}`,
  status: 'pending',
  priority: 2,
  tags: [],
  createdAt: '2026-09-01T12:00:00.000Z',
  dueDate: null,
  ...over,
});

const onStatusToggle = vi.fn();
const onDelete = vi.fn();

// The providers sit OUTSIDE the part that changes, as they do in the app (the
// ThemeProvider and router do not re-render when a task changes). `setTasks`
// drives only the list.
let setTasks;
const Rows = ({ initial }) => {
  const [tasks, set] = React.useState(initial);
  setTasks = set;
  return tasks.map((t) => (
    <TaskRow key={t.id} task={t} onStatusToggle={onStatusToggle} onDelete={onDelete} />
  ));
};
const mount = (initial) =>
  render(
    <MemoryRouter>
      <ThemeProvider theme={theme}>
        <Rows initial={initial} />
      </ThemeProvider>
    </MemoryRouter>
  );

describe('TaskRow memoisation', () => {
  it('re-renders only the row whose task changed', () => {
    const a = mk('a');
    const b = mk('b');
    const c = mk('c');
    const b2 = { ...b, status: 'completed' };

    // What ONE render of the changed row costs, measured in isolation.
    inkSpy.mockClear();
    mount([b2]).unmount();
    const oneRow = inkSpy.mock.calls.length;
    expect(oneRow).toBeGreaterThan(0);

    mount([a, b, c]);
    inkSpy.mockClear();

    // The list re-renders with identical task objects: no row renders.
    act(() => setTasks([a, b, c]));
    expect(inkSpy.mock.calls.length).toBe(0);

    // b is replaced by a new object (a status tap); a and c keep identity.
    act(() => setTasks([a, b2, c]));
    expect(inkSpy.mock.calls.length).toBe(oneRow);
  });
});
