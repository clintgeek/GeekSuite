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
  it('opens on the weigh-in and the number, and does not repeat the top bar\'s title', async () => {
    getSummary.mockResolvedValue({ success: true, data: { total_scans: 0 } });
    renderPage();
    // The weigh-in is a card in the page at every width (it was a floating
    // button on phones), and the number is on the page even with no goal.
    const entry = await screen.findByTestId('weight-quick-add');
    expect(within(entry).getByLabelText(/today.s weight/i)).toBeInTheDocument();
    expect(within(entry).getByRole('button', { name: 'Log' })).toBeDisabled();
    expect(screen.getByTestId('weight-now')).toHaveTextContent(/^31\d\.\d lb$/);
    expect(screen.getByTestId('weight-basis')).toHaveTextContent('7-day average');
    // SIMPLE_AND_FULL_PLAN.md item 8: the title used to appear three times
    // (top bar, eyebrow, heading). The top bar keeps it.
    expect(screen.queryByRole('heading', { name: /weight & body/i })).toBeNull();
  });

  it('a person with no scans sees one quiet line about them, not a card', async () => {
    getSummary.mockResolvedValue({ success: true, data: { total_scans: 0 } });
    renderPage();
    const line = await screen.findByTestId('body-comp-invite');
    expect(within(line).getByRole('link', { name: 'Import a scan' })).toHaveAttribute('href', '/scan-import');
    expect(screen.queryByText('What your weight is made of')).toBeNull();
  });

  it('a failed body-comp query leaves the weight half standing', async () => {
    getSummary.mockRejectedValue(new Error('Cannot query field "bodyCompositionSummary"'));
    getScans.mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findAllByTestId('weight-log-row')).toHaveLength(2);
    expect(await screen.findByText(/body-composition scans didn.t load/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  // A failed read is not an empty log. This drew "No weigh-ins yet" and "No
  // weight goal yet" for a person with a year of weigh-ins and a bad signal.
  it('a soft failure to load the weights says so, never "No weigh-ins yet"', async () => {
    getSummary.mockResolvedValue({ success: true, data: { total_scans: 0 } });
    getWeightLogs.mockResolvedValue({ success: false });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(/your weights didn.t load/i);
    expect(screen.queryByText('No weigh-ins yet')).toBeNull();
    expect(screen.queryByText('No weight goal yet')).toBeNull();
  });

  it('a thrown failure does the same, and Try again brings the weights back', async () => {
    getSummary.mockResolvedValue({ success: true, data: { total_scans: 0 } });
    getWeightLogs.mockRejectedValueOnce(new Error('Network Error'));
    const user = userEvent.setup();
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/your weights didn.t load/i);
    expect(screen.queryByText('No weigh-ins yet')).toBeNull();
    await user.click(within(alert).getByRole('button', { name: /try again/i }));
    expect(await screen.findAllByTestId('weight-log-row')).toHaveLength(2);
    expect(screen.queryByText(/your weights didn.t load/i)).toBeNull();
  });

  it('a brand-new account is still an empty page, with no chart and one way in', async () => {
    getSummary.mockResolvedValue({ success: true, data: { total_scans: 0 } });
    getWeightLogs.mockResolvedValue({ success: true, data: [] });
    renderPage();
    expect(await screen.findByText('No weigh-ins yet')).toBeInTheDocument();
    expect(screen.queryByTestId('weight-chart')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('weight-quick-add')).toBeInTheDocument();
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
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/couldn.t save that change/i);
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
    // The close is a reload, a toast and a 200 ms exit transition: about a
    // second on a busy machine, which is waitFor's whole default.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 5000 });
  });
});
