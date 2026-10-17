/**
 * Saving a blood-pressure reading (review B3, B13, C1, Phase 1.7).
 *
 * - Two readings back to back, forms untouched, used to land on the same
 *   minute and hit the `(userId, measured_at)` unique index. An untouched
 *   time now sends the real instant, seconds included.
 * - A duplicate (`BP_DUPLICATE`) offers "Save it one minute later".
 * - Errors are plain words, never `err.message`.
 * - A card left open across midnight saves on the new day.
 * - The labels say which number is which; on a phone Save is at the bottom.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, within, act, fireEvent } from '@testing-library/react';

vi.mock('@geeksuite/ui', async (importOriginal) => ({
  ...(await importOriginal()),
  useGeekPrimaryAction: () => {},
}));

const { default: AddBPDialog } = await import('../AddBPDialog.jsx');
const { default: QuickAddBP } = await import('../QuickAddBP.jsx');
const { default: BPInsights } = await import('../BPInsights.jsx');

const duplicateError = () => {
  const err = new Error('You already saved a reading at that time.');
  err.graphQLErrors = [{ message: 'You already saved a reading at that time.', extensions: { code: 'BP_DUPLICATE' } }];
  return err;
};

const type = (el, value) => fireEvent.change(el, { target: { value } });

afterEach(() => {
  vi.useRealTimers();
});

describe('AddBPDialog — the instant it sends', () => {
  it('an untouched time sends the real instant, to the second', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 16, 7, 42, 37, 250));
    const onAdd = vi.fn().mockResolvedValue(undefined);
    render(<AddBPDialog open onClose={() => {}} onAdd={onAdd} />);

    type(screen.getByLabelText(/systolic/i), '128');
    type(screen.getByLabelText(/diastolic/i), '82');
    fireEvent.click(screen.getByRole('button', { name: /^save$/i, hidden: true }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    const sent = new Date(onAdd.mock.calls[0][0].measured_at);
    expect(sent.getSeconds()).toBe(37);
    expect(sent.getMilliseconds()).toBe(250);
  });

  it('a typed time is sent as typed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 16, 7, 42, 37));
    const onAdd = vi.fn().mockResolvedValue(undefined);
    render(<AddBPDialog open onClose={() => {}} onAdd={onAdd} />);

    type(screen.getByLabelText(/systolic/i), '128');
    type(screen.getByLabelText(/diastolic/i), '82');
    type(screen.getByLabelText(/^time$/i), '06:15');
    fireEvent.click(screen.getByRole('button', { name: /^save$/i, hidden: true }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    const sent = new Date(onAdd.mock.calls[0][0].measured_at);
    expect([sent.getHours(), sent.getMinutes(), sent.getSeconds()]).toEqual([6, 15, 0]);
  });
});

describe('AddBPDialog — a duplicate minute', () => {
  it('says so plainly and offers to save it one minute later', async () => {
    const onAdd = vi.fn()
      .mockRejectedValueOnce(duplicateError())
      .mockResolvedValueOnce(undefined);
    const onClose = vi.fn();
    render(<AddBPDialog open onClose={onClose} onAdd={onAdd} />);

    type(screen.getByLabelText(/systolic/i), '128');
    type(screen.getByLabelText(/diastolic/i), '82');
    type(screen.getByLabelText(/^time$/i), '07:42');
    fireEvent.click(screen.getByRole('button', { name: /^save$/i, hidden: true }));

    expect(await screen.findByText('You already saved a reading at that time.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /save it one minute later/i, hidden: true }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(2));
    const first = new Date(onAdd.mock.calls[0][0].measured_at).getTime();
    const second = new Date(onAdd.mock.calls[1][0].measured_at).getTime();
    expect(second - first).toBe(60000);
    expect(onAdd.mock.calls[1][0]).toMatchObject({ systolic: 128, diastolic: 82 });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('never shows raw error text', async () => {
    const err = new Error('Request failed with status code 502');
    err.networkError = { statusCode: 502 };
    const onAdd = vi.fn().mockRejectedValue(err);
    render(<AddBPDialog open onClose={() => {}} onAdd={onAdd} />);

    type(screen.getByLabelText(/systolic/i), '128');
    type(screen.getByLabelText(/diastolic/i), '82');
    fireEvent.click(screen.getByRole('button', { name: /^save$/i, hidden: true }));

    expect(await screen.findByText(/restarting/i)).toBeInTheDocument();
    expect(screen.queryByText(/status code/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /one minute later/i, hidden: true })).toBeNull();
  });
});

describe('AddBPDialog — words and thumb', () => {
  it('names the numbers the way the cuff does', () => {
    render(<AddBPDialog open onClose={() => {}} onAdd={async () => {}} />);
    expect(screen.getByLabelText('Top number (systolic)')).toBeInTheDocument();
    expect(screen.getByLabelText('Bottom number (diastolic)')).toBeInTheDocument();
    expect(screen.getByLabelText('Top number (systolic)')).toHaveAttribute('inputmode', 'numeric');
  });

  it('on a phone, Save is the full-width button at the bottom', () => {
    const original = window.matchMedia;
    window.matchMedia = (query) => ({
      matches: true, media: query, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    });
    try {
      render(<AddBPDialog open onClose={() => {}} onAdd={async () => {}} />);
      const bottom = screen.getByTestId('thumb-save');
      expect(within(bottom).getByRole('button', { name: /^save$/i, hidden: true })).toBeInTheDocument();
      // and not also in the header
      expect(screen.getAllByRole('button', { name: /^save$/i, hidden: true })).toHaveLength(1);
    } finally {
      window.matchMedia = original;
    }
  });
});

describe('QuickAddBP card — a tab left open overnight', () => {
  it('saves on the new day after a resume, not the day it mounted', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 22, 0, 0));
    const onAdd = vi.fn().mockResolvedValue(undefined);
    render(<QuickAddBP onAdd={onAdd} />);

    vi.setSystemTime(new Date(2026, 9, 16, 7, 30, 12));
    act(() => { window.dispatchEvent(new Event('focus')); });

    type(screen.getByLabelText(/systolic/i), '128');
    type(screen.getByLabelText(/diastolic/i), '82');
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(onAdd.mock.calls[0][0].date).toBe('2026-10-16');
    const sent = new Date(onAdd.mock.calls[0][0].measured_at);
    expect([sent.getDate(), sent.getHours(), sent.getMinutes(), sent.getSeconds()]).toEqual([16, 7, 30, 12]);
  });

  it('opens the add dialog straight away when asked (?add=1)', async () => {
    const onAutoOpened = vi.fn();
    render(<QuickAddBP onAdd={async () => {}} autoOpen onAutoOpened={onAutoOpened} />);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(onAutoOpened).toHaveBeenCalled();
  });
});

describe('BPInsights — the latest reading', () => {
  it('is the newest by the time it was taken, not the first row of the day', () => {
    const logs = [
      { id: 'am', systolic: 150, diastolic: 95, log_date: '2026-10-16T00:00:00.000Z', measured_at: '2026-10-16T12:00:00.000Z' },
      { id: 'pm', systolic: 121, diastolic: 79, log_date: '2026-10-16T00:00:00.000Z', measured_at: '2026-10-17T01:00:00.000Z' },
    ];
    render(<BPInsights bpLogs={logs} />);
    expect(screen.getByText(/121\/79/)).toBeInTheDocument();
    expect(screen.queryByText(/150\/95/)).toBeNull();
  });
});
