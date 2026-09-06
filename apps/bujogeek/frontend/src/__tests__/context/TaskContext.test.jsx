import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

/**
 * Two state-patching defects found in the 2026-09-05 going-over. Both come
 * from the same fossil: this context once stored tasks as an object keyed by
 * date, and two callbacks still assumed that shape long after every log query
 * started returning a plain array.
 *
 * 1. `migrateTask` ran `Object.entries(prev).forEach(([date, tasks]) =>
 *    tasks.filter(...))`. On an array, `Object.entries` yields `['0', task]`,
 *    so `tasks` was a task OBJECT and `.filter` threw — inside the try, after
 *    the mutation had already succeeded. Scheduling a task to a future date
 *    reported "Failed to migrate task" every single time, and the row never
 *    moved. (Had it not thrown it would have replaced the array with an
 *    object, which every consumer then has to defend against.)
 * 2. `updateTask` only looked at top-level rows, so editing a step from its
 *    parent's expander left the old text on screen; and its object branch
 *    keyed the task by the *UTC* day of an instant `dueDate`, the same class
 *    BURN_REVIEW #8 fixed one file over.
 */

const mutate = vi.fn();
const query = vi.fn();

vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client');
  return {
    ...actual,
    useApolloClient: () => ({ mutate: (...a) => mutate(...a), query: (...a) => query(...a) }),
  };
});

// The recurring-scope dialog pulls in the whole BujoDialog/MUI tree; nothing
// under test opens it.
vi.mock('../../components/tasks/RecurringEditDialog', () => ({ default: () => null }));

import { TaskProvider, useTaskContext } from '../../context/TaskContext';

let api;
function Probe() {
  api = useTaskContext();
  return (
    <ul>
      {(Array.isArray(api.tasks) ? api.tasks : []).map((t) => (
        <li key={t.id} data-testid={`row-${t.id}`}>
          {t.content} — {t.dueDate ?? 'undated'}
          <ul>
            {(t.subtasks ?? []).map((c) => (
              <li key={c.id} data-testid={`step-${c.id}`}>{c.content}</li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

const DAILY = [
  {
    id: 't1',
    content: 'Call the roofer',
    status: 'pending',
    priority: null,
    dueDate: '2026-09-05T14:00:00.000Z',
    subtasks: [{ id: 's1', content: 'Find the number', status: 'pending' }],
  },
];

function renderProvider() {
  return render(
    <TaskProvider>
      <Probe />
    </TaskProvider>
  );
}

async function loadDaily() {
  query.mockResolvedValue({ data: { dailyTasks: DAILY } });
  renderProvider();
  await act(async () => {
    await api.fetchTasks('daily', new Date('2026-09-05T12:00:00.000Z'));
  });
  await screen.findByTestId('row-t1');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TaskContext.migrateTask', () => {
  it('moves the task and reports no error (it used to throw on every call)', async () => {
    await loadDaily();

    mutate.mockResolvedValue({
      data: {
        migrateTaskToFuture: {
          ...DAILY[0],
          dueDate: '2026-09-12T00:00:00.000Z',
          status: 'migrated_future',
        },
      },
    });

    let returned;
    await act(async () => {
      returned = await api.migrateTask('t1', new Date('2026-09-12T12:00:00.000Z'));
    });

    expect(returned?.dueDate).toBe('2026-09-12T00:00:00.000Z');
    await waitFor(() => {
      expect(screen.getByTestId('row-t1').textContent).toContain('2026-09-12T00:00:00.000Z');
    });
    // The failure this replaces: the mutation succeeded and the context still
    // set an error, because the state patch threw after it.
    expect(api.error).toBeNull();
    // And the shape survives — an object here breaks every consumer.
    expect(Array.isArray(api.tasks)).toBe(true);
  });
});

describe('TaskContext.updateTask', () => {
  it('patches a step in its parent’s subtasks array, not just top-level rows', async () => {
    await loadDaily();

    mutate.mockResolvedValue({
      data: { updateTask: { id: 's1', content: 'Find the roofer’s number', status: 'pending' } },
    });

    await act(async () => {
      await api.updateTask('s1', { content: 'Find the roofer’s number' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('step-s1').textContent).toBe('Find the roofer’s number');
    });
  });

  it('keeps fields the mutation does not select instead of dropping them', async () => {
    await loadDaily();

    // The gateway's updateTask payload has no `subtasks` when only content
    // changed; replacing the object wholesale used to lose the steps.
    mutate.mockResolvedValue({
      data: { updateTask: { id: 't1', content: 'Call the roofer back', status: 'pending' } },
    });

    await act(async () => {
      await api.updateTask('t1', { content: 'Call the roofer back' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('row-t1').textContent).toContain('Call the roofer back');
    });
    expect(screen.getByTestId('step-s1')).toBeInTheDocument();
  });
});
