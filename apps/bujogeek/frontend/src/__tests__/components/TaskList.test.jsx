import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { createBuJoTheme } from '../../theme/theme';
import TaskList from '../../components/tasks/TaskList';

/**
 * Regression test for BURN_REVIEW #8: TaskList grouped tasks by the UTC day
 * for dueDate/createdAt, which bujogeek stores as instants (a task can carry
 * a reminder time). A task due late in the evening, local time, was landing
 * under *tomorrow's* UTC heading. The fix groups by the local day
 * (`localDateString`), matching how the rest of the app treats these fields.
 *
 * Node re-reads `process.env.TZ` on every date operation, so we can drive the
 * host timezone from inside the test.
 */
const REAL_TZ = process.env.TZ;
function withTZ(tz, fn) {
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (REAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = REAL_TZ;
  }
}
afterEach(() => {
  if (REAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = REAL_TZ;
});

// TaskList reads updateTaskStatus/deleteTask/etc. and `compareTasks` off
// `../../context/TaskContext`. Mock the hook (no Apollo provider needed for
// this test) but keep the real comparator, since that's the ordering under
// test's sibling logic.
vi.mock('../../context/TaskContext', async () => {
  const actual = await vi.importActual('../../context/TaskContext');
  return {
    ...actual,
    useTaskContext: () => ({
      updateTaskStatus: vi.fn(),
      deleteTask: vi.fn(),
      migrateTask: vi.fn(),
      updateTask: vi.fn(),
      filters: {},
      saveDailyOrder: vi.fn(),
      currentDate: new Date(),
    }),
  };
});

// TaskEditor pulls in Apollo hooks (useTaskTags -> useQuery) that need a
// real ApolloProvider; TaskList's own grouping logic under test never opens
// it (editDialogOpen starts false), so stub it out entirely.
vi.mock('../../components/tasks/TaskEditor', () => ({
  default: () => null,
}));

const theme = createBuJoTheme('light');

function renderList(tasks, viewType) {
  return render(
    <ThemeProvider theme={theme}>
      <TaskList tasks={tasks} viewType={viewType} />
    </ThemeProvider>
  );
}

describe('TaskList grouping (non-daily views)', () => {
  it('groups a task due 23:30 America/Chicago under that local day, not the next UTC day', () => {
    withTZ('America/Chicago', () => {
      // 23:30 on Feb 26 in Chicago (CST, UTC-6) is 05:30 UTC on Feb 27.
      // The old UTC-day grouping put this under "Friday, February 27, 2026";
      // it belongs under "Thursday, February 26, 2026".
      const task = {
        _id: 't1',
        content: 'Take the trash out',
        signifier: '*',
        status: 'pending',
        priority: null,
        dueDate: '2026-02-27T05:30:00.000Z',
        createdAt: '2026-02-26T12:00:00.000Z',
      };

      renderList([task], 'search');

      expect(screen.getByText('Thursday, February 26, 2026')).toBeInTheDocument();
      expect(screen.queryByText('Friday, February 27, 2026')).not.toBeInTheDocument();
    });
  });

  it('falls back to createdAt (also grouped by local day) when dueDate is absent', () => {
    withTZ('America/Chicago', () => {
      // 22:00 on Mar 4 in Chicago (CST, UTC-6) is 04:00 UTC on Mar 5.
      const task = {
        _id: 't2',
        content: 'Undated task',
        signifier: '*',
        status: 'pending',
        priority: null,
        dueDate: null,
        createdAt: '2026-03-05T04:00:00.000Z',
      };

      renderList([task], 'search');

      expect(screen.getByText('Wednesday, March 4, 2026')).toBeInTheDocument();
      expect(screen.queryByText('Thursday, March 5, 2026')).not.toBeInTheDocument();
    });
  });
});
