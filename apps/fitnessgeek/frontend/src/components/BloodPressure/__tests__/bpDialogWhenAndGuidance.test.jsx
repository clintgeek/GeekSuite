/**
 * Round two, the blood-pressure dialog:
 * - the common case never shows a raw date or time input: "Today" is chosen
 *   and the line under it says "Taken just now";
 * - a reading's category comes with one calm line of guidance, in the
 *   warning tone for stage 1 (not red), and a clear, serious line for a
 *   crisis-range reading.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { createFitnessTheme } from '../../../theme/theme.jsx';
import { bpGuidance, BP_STAGES } from '../../../utils/bpUtils.js';

process.env.TZ = 'America/Chicago';
const { default: AddBPDialog } = await import('../AddBPDialog.jsx');

const type = (el, value) => fireEvent.change(el, { target: { value } });
const renderDialog = (props = {}) => render(
  <ThemeProvider theme={createFitnessTheme('light')}>
    <AddBPDialog open onClose={() => {}} onAdd={vi.fn().mockResolvedValue(undefined)} {...props} />
  </ThemeProvider>
);

afterEach(() => vi.useRealTimers());

describe('when the reading was taken', () => {
  it('opens on Today and "Taken just now", with no date or time input', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Today', hidden: true })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Taken just now')).toBeInTheDocument();
    expect(screen.queryByLabelText('Date')).toBeNull();
    expect(screen.queryByLabelText('Time')).toBeNull();
  });

  it('Yesterday is one tap: it saves on yesterday, and asks what time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 16, 7, 30, 0));
    const onAdd = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onAdd });
    type(screen.getByLabelText(/systolic/i), '128');
    type(screen.getByLabelText(/diastolic/i), '82');
    fireEvent.click(screen.getByRole('button', { name: 'Yesterday', hidden: true }));
    expect(screen.getByLabelText('Time')).toBeInTheDocument();
    expect(screen.queryByLabelText('Date')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^save$/i, hidden: true }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(onAdd.mock.calls[0][0].date).toBe('2026-10-15');
    expect(new Date(onAdd.mock.calls[0][0].measured_at).getDate()).toBe(15);
  });

  it('"Another day" reveals the native date field', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 16, 7, 30, 0));
    const onAdd = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onAdd });
    type(screen.getByLabelText(/systolic/i), '128');
    type(screen.getByLabelText(/diastolic/i), '82');
    fireEvent.click(screen.getByRole('button', { name: 'Another day', hidden: true }));
    const date = screen.getByLabelText('Date');
    expect(date).toHaveAttribute('type', 'date');
    expect(date).toHaveAttribute('max', '2026-10-16');
    type(date, '2026-10-09');
    fireEvent.click(screen.getByRole('button', { name: /^save$/i, hidden: true }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(onAdd.mock.calls[0][0].date).toBe('2026-10-09');
  });

  it('an edit of an older reading opens on its own day and time', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 16, 7, 30, 0));
    renderDialog({
      mode: 'edit',
      initialValues: { id: 'x', systolic: 128, diastolic: 82, log_date: '2026-10-09T00:00:00.000Z', measured_at: '2026-10-09T13:05:00.000Z' },
    });
    expect(screen.getByRole('button', { name: 'Another day', hidden: true })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Date')).toHaveValue('2026-10-09');
    expect(screen.getByLabelText('Time')).toHaveValue('08:05');
  });
});

describe('what the reading is', () => {
  const typed = (sys, dia) => {
    renderDialog();
    type(screen.getByLabelText(/systolic/i), String(sys));
    type(screen.getByLabelText(/diastolic/i), String(dia));
    return screen.getByTestId('bp-reading-status');
  };

  it('stage 1 is the warning tone with one calm line, not red with nothing', () => {
    const status = typed(128, 82);
    expect(within(status).getByText('High (stage 1)')).toBeInTheDocument();
    expect(within(status).getByTestId('bp-reading-guidance')).toHaveTextContent('Worth mentioning to your doctor if it stays here.');
    const dot = within(status).getByText('High (stage 1)').querySelector('[aria-hidden]');
    const bg = window.getComputedStyle(dot).backgroundColor;
    expect(bg).toBe('rgb(154, 82, 0)'); // warning.main
    expect(bg).not.toBe('rgb(201, 42, 42)'); // not the error red
    expect(within(status).queryByRole('alert')).toBeNull();
  });

  it('a normal reading has no advice to give', () => {
    const status = typed(118, 74);
    expect(within(status).getByText('Normal')).toBeInTheDocument();
    expect(within(status).queryByTestId('bp-reading-guidance')).toBeNull();
  });

  it('a crisis-range reading keeps a clear, serious line', () => {
    const status = typed(190, 125);
    const line = within(status).getByRole('alert');
    expect(line).toHaveTextContent(/This is very high\. Sit quietly for five minutes and measure again\./);
    expect(line).toHaveTextContent(/call your doctor today/);
    expect(line).toHaveTextContent(/call 911/);
  });

  it('every guidance line is general: it never names a diagnosis or a drug', () => {
    for (const stage of Object.values(BP_STAGES)) {
      const g = bpGuidance(stage);
      if (!g) continue;
      expect(g.text).not.toMatch(/hypertension|diagnos|medication|you have/i);
    }
    expect(bpGuidance(BP_STAGES.NORMAL)).toBeNull();
    expect(bpGuidance('Unknown')).toBeNull();
    expect(bpGuidance(BP_STAGES.CRISIS).serious).toBe(true);
    expect(bpGuidance(BP_STAGES.STAGE_2).serious).toBe(false);
  });
});
