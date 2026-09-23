/**
 * WeightLogList — no day-over-day deltas (§0), a source marker for scale
 * rows (F9), and an edit that cannot fail silently.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { default: WeightLogList } = await import('../WeightLogList.jsx');

const LOGS = [
  { id: 'w1', weight_value: 318.2, log_date: '2026-09-20T00:00:00.000Z', source: 'arboleaf_xlsx', notes: null },
  { id: 'w2', weight_value: 316.4, log_date: '2026-09-21T00:00:00.000Z', source: 'manual', notes: 'after the gym' },
  { id: 'w3', weight_value: 317.0, log_date: '2026-09-19T00:00:00.000Z', source: 'manual', notes: null },
];

describe('WeightLogList', () => {
  it('shows no change against the previous entry', () => {
    render(<WeightLogList logs={LOGS} onDelete={() => {}} />);
    const text = screen.getAllByTestId('weight-log-row').map((r) => r.textContent).join(' ');
    // 316.4 vs 318.2 used to render "-1.8 lbs"; nothing signed may appear.
    expect(text).not.toMatch(/[+\-−]\s?\d/);
    expect(text).not.toMatch(/1\.8/);
  });

  it('marks scale rows "Scale", and only those', () => {
    render(<WeightLogList logs={LOGS} onDelete={() => {}} />);
    const rows = screen.getAllByTestId('weight-log-row');
    // Newest first: 21 (manual), 20 (scale), 19 (manual).
    expect(within(rows[0]).queryByText('Scale')).toBeNull();
    expect(within(rows[1]).getByText('Scale')).toBeInTheDocument();
    expect(within(rows[2]).queryByText('Scale')).toBeNull();
    expect(within(rows[0]).getByText('after the gym')).toBeInTheDocument();
  });

  it('uses the EmptyState primitive when there are no logs', () => {
    render(<WeightLogList logs={[]} onDelete={() => {}} />);
    expect(screen.getByText('No weigh-ins yet')).toBeInTheDocument();
  });

  it('edits a weight and its note, and closes on success', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockResolvedValue(true);
    render(<WeightLogList logs={LOGS} onDelete={() => {}} onUpdate={onUpdate} />);

    await user.click(screen.getByRole('button', { name: /edit the 316\.4/i }));
    const dialog = await screen.findByRole('dialog');
    const field = within(dialog).getByLabelText(/weight \(lbs\)/i);
    await user.clear(field);
    await user.type(field, '316.8');
    const note = within(dialog).getByLabelText(/note/i);
    await user.clear(note);
    await user.type(note, 'fixed typo');
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));

    expect(onUpdate).toHaveBeenCalledWith('w2', { weight_value: 316.8, notes: 'fixed typo' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  }, 15000); // userEvent typing into two MUI fields runs past 5 s under a full parallel suite

  it('a failed save stays open and says it was not saved', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockResolvedValue(false);
    render(<WeightLogList logs={LOGS} onDelete={() => {}} onUpdate={onUpdate} />);

    await user.click(screen.getByRole('button', { name: /edit the 316\.4/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/not saved/i);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('a rejected save shows the server\'s reason', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockRejectedValue(new Error('Weight record not found'));
    render(<WeightLogList logs={LOGS} onDelete={() => {}} onUpdate={onUpdate} />);

    await user.click(screen.getByRole('button', { name: /edit the 316\.4/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Weight record not found');
  });

  it('warns that a re-import replaces an edited scale value', async () => {
    const user = userEvent.setup();
    render(<WeightLogList logs={LOGS} onDelete={() => {}} onUpdate={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /edit the 318\.2/i }));
    expect(await screen.findByText(/came from the scale/i)).toBeInTheDocument();
  });
});
