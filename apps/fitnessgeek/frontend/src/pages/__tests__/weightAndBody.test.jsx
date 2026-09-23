/**
 * "Weight & body" (FITNESSGEEK_BODY_DATA_PLAN D6): the weight half and the
 * body-composition half load and fail independently, and an edit whose
 * server answer carries no row is reported as the failure it is.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const LOGS = [
  { id: 'w1', weight_value: 318.2, log_date: '2026-09-20T00:00:00.000Z', source: 'arboleaf_xlsx', notes: null },
  { id: 'w2', weight_value: 316.4, log_date: '2026-09-21T00:00:00.000Z', source: 'manual', notes: null },
];

const getWeightLogs = vi.fn();
const updateWeightLog = vi.fn();
const getSummary = vi.fn();
const getScans = vi.fn();

vi.mock('../../services/weightService', () => ({
  weightService: {
    getWeightLogs: (...a) => getWeightLogs(...a),
    updateWeightLog: (...a) => updateWeightLog(...a),
    createWeightLog: vi.fn(),
    deleteWeightLog: vi.fn(),
  },
}));
vi.mock('../../services/settingsService.js', () => ({
  settingsService: { getSettings: async () => ({ success: true, data: {} }) },
}));
vi.mock('../../services/bodyCompService.js', () => ({
  bodyCompService: {
    getSummary: (...a) => getSummary(...a),
    getScans: (...a) => getScans(...a),
  },
}));
vi.mock('@geeksuite/ui', async (importOriginal) => ({
  ...(await importOriginal()),
  useToast: () => ({ notify: vi.fn() }),
  useGeekPrimaryAction: () => {},
}));
vi.mock('../../components/Weight/WeightTimeline.jsx', () => ({ default: () => <div data-testid="weight-chart" /> }));
vi.mock('../../components/BodyComposition/BodyCompTrend.jsx', () => ({ default: () => <div data-testid="bc-chart" /> }));

const { default: Weight } = await import('../Weight.jsx');

const renderPage = () => render(<MemoryRouter><Weight /></MemoryRouter>);

beforeEach(() => {
  getWeightLogs.mockReset().mockResolvedValue({ success: true, data: LOGS });
  updateWeightLog.mockReset();
  getSummary.mockReset();
  getScans.mockReset().mockResolvedValue({ success: true, data: [] });
});

describe('Weight & body page', () => {
  it('is titled "Weight & body"', async () => {
    getSummary.mockResolvedValue({ success: true, data: { total_scans: 0 } });
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Weight & body' })).toBeInTheDocument();
  });

  it('a failed body-comp query leaves the weight half standing', async () => {
    getSummary.mockRejectedValue(new Error('Cannot query field "bodyCompositionSummary"'));
    getScans.mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findAllByTestId('weight-log-row')).toHaveLength(2);
    expect(await screen.findByText(/body composition didn.t load/i)).toBeInTheDocument();
    expect(screen.getByText(/your weight above is unaffected/i)).toBeInTheDocument();
  });

  it('an update that answers with no row is a failure, shown in the dialog', async () => {
    getSummary.mockResolvedValue({ success: true, data: { total_scans: 0 } });
    // apiService.put's shape when the mutation resolves null.
    updateWeightLog.mockResolvedValue({ success: true, data: null });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /edit the 316\.4/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/not saved/i);
    expect(updateWeightLog).toHaveBeenCalledWith('w2', { weight_value: 316.4, notes: '' });
  });

  it('a successful update refreshes the list in place (no page spinner)', async () => {
    getSummary.mockResolvedValue({ success: true, data: { total_scans: 0 } });
    updateWeightLog.mockResolvedValue({ success: true, data: { ...LOGS[1], weight_value: 316.9 } });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /edit the 316\.4/i }));
    const dialog = await screen.findByRole('dialog');
    // Hold the refresh open so the page can be looked at mid-reload.
    let release;
    getWeightLogs.mockImplementationOnce(() => new Promise((resolve) => {
      release = () => resolve({ success: true, data: [LOGS[0], { ...LOGS[1], weight_value: 316.9 }] });
    }));
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(getWeightLogs).toHaveBeenCalledTimes(2));
    // Mid-reload: the list is still there (and already shows the saved row),
    // not swapped for the page's full-height spinner.
    expect(screen.getAllByTestId('weight-log-row')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /edit the 316\.9/i, hidden: true })).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
    release();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
