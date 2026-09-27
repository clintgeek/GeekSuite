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

function Harness() {
  const meds = useMedsToday('2026-09-27');
  return <MedsChecklist items={meds.items} taken={meds.taken} total={meds.total} onToggle={meds.toggle} saving={meds.saving} error={meds.error} />;
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

  it('a failed save is taken back and said plainly', async () => {
    medsService.log.mockRejectedValue(new Error('offline'));
    render(<Harness />);
    const lisinopril = await screen.findByRole('checkbox', { name: 'Lisinopril, morning' });
    await act(async () => { fireEvent.click(lisinopril); });
    await waitFor(() => expect(screen.getByText("Couldn't save Lisinopril. Try again.")).toBeInTheDocument());
    expect(screen.getByRole('checkbox', { name: 'Lisinopril, morning' })).toHaveAttribute('aria-checked', 'false');
  });
});
