/**
 * One-tap "move to tomorrow" on Today — DOCS/BUJOGEEK_REVIEW_2026-09.md §4.1.
 *
 * Deferring a task is probably the second most common daily decision after
 * finishing one, and it cost four interactions: Edit, dialog, find the date
 * field, save. `ReviewPage` has had the one-tap version since it shipped; it
 * was never offered on the screen where the decision is actually made.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
// `fireEvent`, not user-event: this app does not carry that dependency and
// the sibling component tests all use fireEvent.
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { createBuJoTheme } from '../../theme/theme';
import TaskRow from '../../components/tasks/TaskRow';

process.env.TZ = 'America/Chicago';

// Same wrapper the sibling TaskRow suite uses: the row calls `useNavigate`
// and reads the theme, so both providers are required.
vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client');
  return { ...actual, useMutation: () => [vi.fn(), { loading: false }] };
});

// Force the MOBILE surface. `TaskRow` renders its actions two ways — a hover
// cluster at `md`+ and an always-visible ⋯ sheet below it — and in jsdom
// neither appears by default: `useMediaQuery` reports false and the hover
// cluster needs hover. The sheet is the one a test can drive, and both are
// built from the same `actionItems` list.
vi.mock('@mui/material', async () => {
  const actual = await vi.importActual('@mui/material');
  return { ...actual, useMediaQuery: () => true };
});

const theme = createBuJoTheme('light');

const task = (over = {}) => ({
  id: 't1',
  content: 'Call the roofer',
  status: 'pending',
  priority: null,
  dueDate: '2026-09-21T00:00:00.000Z',
  subtasks: [],
  ...over,
});

const renderRow = ({ task: over, ...props } = {}) =>
  render(
    <MemoryRouter>
      <ThemeProvider theme={theme}>
        <TaskRow task={task(over)} onStatusToggle={vi.fn()} {...props} />
      </ThemeProvider>
    </MemoryRouter>
  );

describe('the row action', () => {
  // Below `md` the actions live behind an always-visible ⋯ that opens a
  // sheet; the hover cluster is the `md`+ surface and does not render in
  // jsdom. Both are built from the same `actionItems` list, so opening the
  // sheet exercises the same entry.
  const openSheet = () =>
    fireEvent.click(screen.getByRole('button', { name: /^actions for/i }));

  it('is offered on a pending task', () => {
    renderRow({ onMoveToTomorrow: vi.fn() });
    openSheet();
    expect(
      screen.getAllByRole('button', { name: /move to tomorrow/i }).length
    ).toBeGreaterThan(0);
  });

  it('calls back with the task', () => {
    const onMoveToTomorrow = vi.fn();
    renderRow({ onMoveToTomorrow });
    openSheet();

    fireEvent.click(screen.getAllByRole('button', { name: /move to tomorrow/i })[0]);

    expect(onMoveToTomorrow).toHaveBeenCalledTimes(1);
    expect(onMoveToTomorrow.mock.calls[0][0]).toMatchObject({ id: 't1' });
  });

  it('is absent when no handler is wired', () => {
    // Every other row action is conditional on its callback; this one follows
    // the same rule, so a screen that does not support deferring does not
    // advertise it.
    // `onEdit` so the sheet has something in it: the assertion is that THIS
    // entry is missing from a populated sheet, not that the sheet is empty.
    renderRow({ onEdit: vi.fn() });
    openSheet();
    expect(screen.queryByRole('button', { name: /move to tomorrow/i })).toBeNull();
    expect(screen.getAllByRole('button', { name: /edit/i }).length).toBeGreaterThan(0);
  });

  it('is hidden on a completed task', () => {
    // Rescheduling something already resolved is not a thing.
    renderRow({ onMoveToTomorrow: vi.fn(), onEdit: vi.fn(), task: { status: 'completed' } });
    openSheet();
    expect(screen.queryByRole('button', { name: /move to tomorrow/i })).toBeNull();
  });

  it('is hidden on a cancelled task', () => {
    renderRow({ onMoveToTomorrow: vi.fn(), onEdit: vi.fn(), task: { status: 'cancelled' } });
    openSheet();
    expect(screen.queryByRole('button', { name: /move to tomorrow/i })).toBeNull();
  });
});
