/**
 * Weight page (review B3, B18, Phase 1.8, Phase 2.14):
 *   - the quick-add dialog opens on TODAY at open time, not on the day the
 *     page mounted (one weight per day, so yesterday's got overwritten);
 *   - `?add=1` opens it straight away, and the phone button says "Log weight";
 *   - a delete says "Removed … · Undo", and Undo re-creates the row;
 *   - a delete answered `false` is not reported as done;
 *   - "lose a little" from the first run gets one sentence and a button.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const LOGS = [
  { id: 'w1', weight_value: 218.7, log_date: '2026-10-15T00:00:00.000Z', source: 'manual', notes: 'after run' },
];

const getWeightLogs = vi.fn();
const createWeightLog = vi.fn();
const deleteWeightLog = vi.fn();
const notify = vi.fn();
let experience = { isSimple: true, goal: null };

vi.mock('../../services/weightService', () => ({
  weightService: {
    getWeightLogs: (...a) => getWeightLogs(...a),
    updateWeightLog: vi.fn(),
    createWeightLog: (...a) => createWeightLog(...a),
    deleteWeightLog: (...a) => deleteWeightLog(...a),
  },
}));
vi.mock('../../services/settingsService.js', () => ({
  settingsService: { getSettings: async () => ({ success: true, data: {} }) },
}));
vi.mock('../../hooks/useBodyComp.js', () => ({
  useBodyComp: () => ({ summary: null, scans: [], loading: false, error: null, scansError: null, reload: () => {} }),
}));
vi.mock('../../contexts/ExperienceContext.jsx', () => ({
  useExperience: () => experience,
}));
vi.mock('@geeksuite/ui', async (importOriginal) => ({
  ...(await importOriginal()),
  useToast: () => ({ notify }),
  useGeekPrimaryAction: () => {},
}));
vi.mock('../../components/Weight/WeightTimeline.jsx', () => ({ default: () => <div data-testid="weight-chart" /> }));

const { default: Weight } = await import('../Weight.jsx');

const renderAt = (url = '/weight') => render(<MemoryRouter initialEntries={[url]}><Weight /></MemoryRouter>);

beforeEach(() => {
  experience = { isSimple: true, goal: null };
  notify.mockReset();
  getWeightLogs.mockReset().mockResolvedValue({ success: true, data: LOGS });
  createWeightLog.mockReset().mockResolvedValue({ success: true, data: { ...LOGS[0], id: 'w2' } });
  deleteWeightLog.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Weight page — logging', () => {
  it('the phone button reads "Log weight", and the dialog opens on today after a resume', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 21, 0, 0));
    renderAt();
    const fab = await screen.findByTestId('log-weight-fab');
    expect(fab).toHaveTextContent('Log weight');

    // The PWA sat in recents overnight.
    vi.setSystemTime(new Date(2026, 9, 16, 7, 0, 0));
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });

    fireEvent.click(fab);
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/weight \(lbs\)/i), { target: { value: '217.9' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^save$/i, hidden: true }));

    await waitFor(() => expect(createWeightLog).toHaveBeenCalledTimes(1));
    expect(createWeightLog.mock.calls[0][0]).toMatchObject({ weight_value: 217.9, log_date: '2026-10-16' });
  });

  it('?add=1 opens the weight dialog directly', async () => {
    renderAt('/weight?add=1');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/weight \(lbs\)/i)).toBeInTheDocument();
  });
});

describe('Weight page — delete', () => {
  it('says "Removed …" with an Undo that re-creates the row', async () => {
    deleteWeightLog.mockResolvedValue({ success: true, data: true });
    renderAt();
    fireEvent.click(await screen.findByLabelText(/delete the 218.7 lbs entry/i));

    await waitFor(() => expect(notify).toHaveBeenCalledWith(
      'Removed 218.7 lbs from Oct 15',
      expect.objectContaining({ action: expect.anything() }),
    ));
    const [, opts] = notify.mock.calls.find(([m]) => /^Removed/.test(m));
    render(opts.action);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    await waitFor(() => expect(createWeightLog).toHaveBeenCalledWith({
      weight_value: 218.7,
      log_date: '2026-10-15',
      notes: 'after run',
    }));
  });

  it('a delete answered false shows no success', async () => {
    deleteWeightLog.mockResolvedValue({ success: true, data: false });
    renderAt();
    fireEvent.click(await screen.findByLabelText(/delete the 218.7 lbs entry/i));

    await waitFor(() => expect(notify).toHaveBeenCalled());
    const messages = notify.mock.calls.map(([m]) => m);
    expect(messages.some((m) => /removed 218|deleted successfully/i.test(m))).toBe(false);
    expect(messages.some((m) => /wasn.t removed/i.test(m))).toBe(true);
  });
});

describe('Weight page — the first-run goal is used', () => {
  it('"lose a little" with no goal gets one sentence and a button to set it', async () => {
    experience = { isSimple: true, goal: 'lose' };
    renderAt();
    expect(await screen.findByText(/you said you.d like to lose a little/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /set your goal/i })).toBeInTheDocument();
    expect(screen.queryByText(/no weight goal set/i)).toBeNull();
  });
});
