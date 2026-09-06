import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { createBuJoTheme } from '../../theme/theme';
import TaskRow from '../../components/tasks/TaskRow';
import TaskEditor from '../../components/tasks/TaskEditor';

/**
 * Regression tests for the 2026-09-05 a11y pass (mobile-harness axe run).
 *
 * bujogeek shipped 28 axe findings, and six of them were controls with no
 * accessible name at all:
 *
 *   - `button-name` (4 findings / 28 nodes) — every task and subtask
 *     completion toggle. `TaskCheckbox` renders a drawn circle inside a
 *     `role="checkbox"` button with no text, so without an `aria-label` a
 *     screen reader hears "checkbox" fourteen times on one screen and cannot
 *     tell you which entry it is about.
 *   - `aria-input-field-name` (2 findings / 8 nodes) — the four `Select`s in
 *     the task editor. MUI renders a `Select` as `<div role="combobox">` and
 *     only wires an `InputLabel` to it through `labelId`; the labels were
 *     there but unlinked, so the comboboxes were anonymous.
 *
 * Both are the kind of thing that silently comes back the next time someone
 * copies a call site, hence the tests.
 */

const theme = createBuJoTheme('light');

/* ── The completion toggle ─────────────────────────────────────────────── */

vi.mock('../../context/TaskContext.jsx', () => ({
  useTaskContext: () => ({
    updateTaskStatus: vi.fn(),
    deleteTask: vi.fn(),
    updateTask: vi.fn(),
    createTask: vi.fn(),
    filters: {},
    currentDate: new Date(),
  }),
}));

// `useTaskTags` returns a bare [String]; the editor feeds it straight to an
// Autocomplete, which is loud about being handed an object instead.
vi.mock('../../hooks/useTaskTags', () => ({
  default: () => [],
}));

vi.mock('../../hooks/useCollections', () => ({
  default: () => ({ collections: [], active: [], archived: [], loading: false }),
}));

vi.mock('@apollo/client', async () => {
  const actual = await vi.importActual('@apollo/client');
  return { ...actual, useMutation: () => [vi.fn(), { loading: false }] };
});

function renderRow(task) {
  return render(
    <MemoryRouter>
      <ThemeProvider theme={theme}>
        <TaskRow task={task} onStatusToggle={vi.fn()} />
      </ThemeProvider>
    </MemoryRouter>
  );
}

const baseTask = {
  _id: 't1',
  id: 't1',
  content: 'Call the roofer #house',
  signifier: '*',
  status: 'pending',
  priority: null,
  tags: ['house'],
};

describe('TaskRow completion toggle — accessible name', () => {
  it('names the toggle after the entry it completes', () => {
    renderRow(baseTask);

    // The tag is stripped from the displayed content, so it is stripped from
    // the name too — the label should read like the row does.
    expect(
      screen.getByRole('checkbox', { name: 'Mark "Call the roofer" done' })
    ).toBeInTheDocument();
  });

  it('follows aria-checked: a done entry offers to un-do it', () => {
    renderRow({ ...baseTask, status: 'completed' });

    const box = screen.getByRole('checkbox', {
      name: 'Mark "Call the roofer" not done',
    });
    expect(box).toHaveAttribute('aria-checked', 'true');
  });

  it('never ships nameless, even when the entry has no readable content', () => {
    renderRow({ ...baseTask, content: '#house' });

    expect(
      screen.getByRole('checkbox', { name: 'Mark "this entry" done' })
    ).toBeInTheDocument();
  });
});

/* ── The editor's Selects ──────────────────────────────────────────────── */

function renderEditor() {
  return render(
    <MemoryRouter>
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <TaskEditor open onClose={vi.fn()} task={null} />
        </LocalizationProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
}

describe('TaskEditor selects — accessible names', () => {
  // The assertion is synchronous; the time goes into mounting the editor's MUI
  // tree (dialog + four Selects + the date picker), which on a loaded build box
  // has been measured past vitest's 5s default. Raised so a slow machine reads
  // as slow rather than as a regression — this flaked in the 2026-09-05
  // going-over while six other reviewers were building on the same four cores.
  it.each([['Type'], ['Priority'], ['Collection']])(
    'gives the %s combobox its visible label as its name',
    (name) => {
      renderEditor();
      expect(screen.getByRole('combobox', { name })).toBeInTheDocument();
    },
    20000
  );
});
