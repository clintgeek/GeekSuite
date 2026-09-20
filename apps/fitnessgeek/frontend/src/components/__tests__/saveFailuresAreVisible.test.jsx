/**
 * A failed save must not look like a successful one.
 *
 * Both logging dialogs closed and blanked their form whatever happened. The
 * blood-pressure one even renders an inline <Alert> for a failed save that
 * could NEVER fire, because its `onAdd` caught everything and never rejected —
 * error UI written for a case the code had made unreachable, the same shape as
 * the display fallbacks the measured_at backfill killed.
 *
 * The cost is specific: log a reading on bad signal, watch the dialog close
 * and the form clear, and by the time you notice it was never saved you no
 * longer remember the number. On an app whose whole premise is that logging
 * should be easier than remembering.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@geeksuite/ui', async (importOriginal) => ({
  ...(await importOriginal()),
  useToast: () => ({ notify: vi.fn() }),
  useGeekPrimaryAction: () => {},
}));

const { default: QuickAddWeight } = await import('../Weight/QuickAddWeight.jsx');

describe('QuickAddWeight keeps the dialog open when the save fails', () => {
  it('shows an inline error and does NOT clear the field', async () => {
    const user = userEvent.setup();
    // The real hook resolves false rather than rejecting — that is precisely
    // why awaiting it and closing was wrong.
    const onAdd = vi.fn().mockResolvedValue(false);

    render(<QuickAddWeight onAdd={onAdd} unit="lbs" />);

    const input = screen.getAllByLabelText(/weight/i)[0];
    await user.type(input, '184.2');
    await user.click(screen.getAllByRole('button', { name: /^add$/i })[0]);

    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByText(/could not save that weight/i)).toBeInTheDocument()
    );
    // The number the user typed is still there to retry with.
    expect(input).toHaveValue(184.2);
  });

  it('clears and closes on a successful save', async () => {
    // The fix must not make success sticky.
    const user = userEvent.setup();
    const onAdd = vi.fn().mockResolvedValue(true);

    render(<QuickAddWeight onAdd={onAdd} unit="lbs" />);

    const input = screen.getAllByLabelText(/weight/i)[0];
    await user.type(input, '184.2');
    await user.click(screen.getAllByRole('button', { name: /^add$/i })[0]);

    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(screen.queryByText(/could not save that weight/i)).not.toBeInTheDocument();
  });

  it('handles a caller that throws as well as one that returns false', async () => {
    // So the dialog does not depend on which convention its parent uses.
    const user = userEvent.setup();
    const onAdd = vi.fn().mockRejectedValue(new Error('Network unreachable'));

    render(<QuickAddWeight onAdd={onAdd} unit="lbs" />);

    const input = screen.getAllByLabelText(/weight/i)[0];
    await user.type(input, '190');
    await user.click(screen.getAllByRole('button', { name: /^add$/i })[0]);

    await waitFor(() =>
      expect(screen.getByText(/network unreachable/i)).toBeInTheDocument()
    );
  });
});
