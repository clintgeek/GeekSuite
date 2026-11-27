/**
 * "Did you take your meds?" — a tick writes a dose log, an untick writes a
 * `taken: false` one, and the checklist and its count follow
 * (DOCS/SIMPLE_AND_FULL_PLAN.md item 6).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const render = (ui) => rtlRender(<MemoryRouter>{ui}</MemoryRouter>);

vi.mock('../../services/medsService.js', () => {
  const medsService = { list: vi.fn(), getLogsByDate: vi.fn(), log: vi.fn() };
  return { medsService, default: medsService };
});
const { medsService } = await import('../../services/medsService.js');
const { useMedsToday } = await import('../useMedsToday.js');
const { default: MedsChecklist } = await import('../../components/Home/MedsChecklist.jsx');

const { MEDS_CHANGED_EVENT } = await import('../useMedsToday.js');
const { todayStrip } = await import('../../utils/checkIns.js');

function Harness() {
  const meds = useMedsToday('2026-09-27');
  return <MedsChecklist items={meds.items} taken={meds.taken} total={meds.total} onToggle={meds.toggle} saving={meds.saving} error={meds.error} unknown={meds.ticksUnknown} ticksError={meds.ticksError} onRetry={meds.reload} />;
}

beforeEach(() => {
  vi.clearAllMocks();
  medsService.list.mockResolvedValue([{ id: 'm1', display_name: 'Lisinopril', times_of_day: ['morning'] }, { id: 'm2', display_name: 'Metformin', times_of_day: ['evening'] }]);
  medsService.getLogsByDate.mockResolvedValue([]);
  medsService.log.mockResolvedValue({ _id: 'new' });
});

describe('the meds checklist', () => {
  it('ticking a dose writes { date, time_of_day, taken: true } and counts it', async () => {
    render(<Harness />);
    const lisinopril = await screen.findByRole('checkbox', { name: 'Lisinopril, morning' });
    expect(lisinopril).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('0 of 2')).toBeInTheDocument();

    await act(async () => { fireEvent.click(lisinopril); });
    expect(medsService.log).toHaveBeenCalledWith('m1', { date: '2026-09-27', time_of_day: 'morning', taken: true });
    expect(screen.getByRole('checkbox', { name: 'Lisinopril, morning, taken' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
  });

  it('unticking writes taken: false — the latest answer is the answer', async () => {
    medsService.getLogsByDate.mockResolvedValue([{ medication_id: 'm2', time_of_day: 'evening', taken: true, created_at: '2026-09-27T01:00:00Z' }]);
    render(<Harness />);
    const metformin = await screen.findByRole('checkbox', { name: 'Metformin, evening, taken' });
    await act(async () => { fireEvent.click(metformin); });
    expect(medsService.log).toHaveBeenCalledWith('m2', { date: '2026-09-27', time_of_day: 'evening', taken: false });
    expect(screen.getByRole('checkbox', { name: 'Metformin, evening' })).toHaveAttribute('aria-checked', 'false');
  });

  it('a second tap while the first is still saving writes nothing more', async () => {
    let finish;
    medsService.log.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<Harness />);
    const lisinopril = await screen.findByRole('checkbox', { name: 'Lisinopril, morning' });
    await act(async () => { fireEvent.click(lisinopril); });
    // The tick is on screen at once; the write has not answered yet.
    const ticked = screen.getByRole('checkbox', { name: 'Lisinopril, morning, taken' });
    await act(async () => { fireEvent.click(ticked); });
    expect(medsService.log).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ _id: 'new' }); });
    expect(screen.getByRole('checkbox', { name: 'Lisinopril, morning, taken' })).toHaveAttribute('aria-checked', 'true');
    // Once it has answered, the dose can be unticked again.
    medsService.log.mockResolvedValue({ _id: 'newer' });
    await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: 'Lisinopril, morning, taken' })); });
    expect(medsService.log).toHaveBeenCalledTimes(2);
    expect(medsService.log).toHaveBeenLastCalledWith('m1', { date: '2026-09-27', time_of_day: 'morning', taken: false });
  });

  it('a failed save is taken back and said plainly', async () => {
    medsService.log.mockRejectedValue(new Error('offline'));
    render(<Harness />);
    const lisinopril = await screen.findByRole('checkbox', { name: 'Lisinopril, morning' });
    await act(async () => { fireEvent.click(lisinopril); });
    await waitFor(() => expect(screen.getByText('Couldn’t save Lisinopril. Try again.')).toBeInTheDocument());
    expect(screen.getByRole('checkbox', { name: 'Lisinopril, morning' })).toHaveAttribute('aria-checked', 'false');
  });
});

// SUITE_REVIEW_2026-11 FitnessGeek #3: a failed dose-log read used to set the
// logs to [] — the checklist then said "0 of 2" with empty boxes, and she
// could take a dose a second time.
describe('a failed dose-log read is unknown, never "nothing taken"', () => {
  it('with no good read for the day: no count, no boxes, a retry that recovers', async () => {
    medsService.getLogsByDate.mockRejectedValueOnce(new Error('offline'));
    render(<Harness />);
    expect(await screen.findByTestId('meds-ticks-unknown')).toBeInTheDocument();
    expect(screen.queryByText('0 of 2')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();

    medsService.getLogsByDate.mockResolvedValueOnce([{ medication_id: 'm1', time_of_day: 'morning', taken: true, created_at: '2026-09-27T12:00:00Z' }]);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })); });
    expect(await screen.findByText('1 of 2')).toBeInTheDocument();
    expect(screen.queryByTestId('meds-ticks-unknown')).not.toBeInTheDocument();
  });

  it('a failed reload on the same day keeps the ticks already read and says so', async () => {
    medsService.getLogsByDate.mockResolvedValueOnce([{ medication_id: 'm1', time_of_day: 'morning', taken: true, created_at: '2026-09-27T12:00:00Z' }]);
    render(<Harness />);
    expect(await screen.findByText('1 of 2')).toBeInTheDocument();

    medsService.getLogsByDate.mockRejectedValueOnce(new Error('offline'));
    await act(async () => { window.dispatchEvent(new Event(MEDS_CHANGED_EVENT)); });
    await waitFor(() => expect(screen.getByText(/Couldn’t refresh your ticks/)).toBeInTheDocument());
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Lisinopril, morning, taken' })).toHaveAttribute('aria-checked', 'true');
  });

  it('the Today strip says "Meds ?" for unknown ticks, not "0 of 2"', () => {
    const items = todayStrip({ weights: [], bloodPressures: [], meds: { taken: 0, total: 2, unknown: true }, today: '2026-09-27' });
    const meds = items.find((i) => i.id === 'meds');
    expect(meds.value).toBe('?');
    expect(meds.done).toBe(false);
    expect(meds.spoken).not.toMatch(/0 of 2/);
  });
});
