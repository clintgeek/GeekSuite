import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { createBuJoTheme } from '../../theme/theme';
import TaskEditor from '../../components/tasks/TaskEditor';

/**
 * Q55 (DOCS/CONTEXT.md § Frontend — Bundle, "What was left on the table"):
 * `TaskEditor` is always-mounted with `open={bool}`, so its top-level imports
 * used to ship with whatever route rendered it — `@mui/x-date-pickers`'
 * `DateTimePicker` and the `useMobilePicker` tail behind it (~150+ kB)
 * included. The picker is now isolated in `TaskDueDateField` and reached
 * through `React.lazy`, so the dynamic `import()` only fires when
 * `TaskEditor`'s `BujoDialog` actually renders it — i.e. the dialog's first
 * open, since `GeekDialog` doesn't mount its body while closed.
 *
 * These two cases stand in for the bundle claim in a way a build measurement
 * can't: they prove the *code path*, not just the *file size* — that closed
 * really means "never imported", and open really means "imported exactly
 * once".
 */

const theme = createBuJoTheme('light');

vi.mock('../../context/TaskContext.jsx', () => ({
  useTaskContext: () => ({
    createTask: vi.fn(),
    updateTask: vi.fn(),
    addSubtask: vi.fn(),
    reorderSubtasks: vi.fn(),
    deleteTask: vi.fn(),
  }),
}));

vi.mock('../../hooks/useTaskTags', () => ({
  default: () => [],
}));

vi.mock('../../hooks/useCollections', () => ({
  default: () => ({ collections: [] }),
}));

vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useMutation: () => [vi.fn(), { loading: false }],
  };
});

vi.mock('@geeksuite/ui', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useToast: () => ({ notify: vi.fn() }),
  };
});

// Spy fires the moment the module is actually evaluated — i.e. the moment
// the dynamic import resolves, not merely the moment `lazy()` is called (that
// registers the loader; it doesn't invoke it).
const pickerModuleEvaluated = vi.fn();
vi.mock('../../components/tasks/TaskDueDateField', () => {
  pickerModuleEvaluated();
  return {
    default: () => <div data-testid="picker-loaded">picker</div>,
  };
});

function renderEditor(props = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <TaskEditor onClose={() => {}} {...props} />
    </ThemeProvider>
  );
}

describe('TaskEditor — lazy date picker (Q55)', () => {
  it('never imports the date-picker module while the dialog is closed', async () => {
    renderEditor({ open: false });

    // Let any pending microtask/dynamic-import settle before asserting the
    // negative — a false pass here would just mean we checked too early.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(pickerModuleEvaluated).not.toHaveBeenCalled();
    expect(screen.queryByTestId('picker-loaded')).not.toBeInTheDocument();
  });

  it('imports the date-picker module once the dialog opens, and only then', async () => {
    const { rerender } = renderEditor({ open: false });
    expect(pickerModuleEvaluated).not.toHaveBeenCalled();

    rerender(
      <ThemeProvider theme={theme}>
        <TaskEditor open onClose={() => {}} />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('picker-loaded')).toBeInTheDocument();
    });
    expect(pickerModuleEvaluated).toHaveBeenCalledTimes(1);
  });
});
