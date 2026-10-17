/**
 * Blood-pressure page: deletes can be undone, a delete that deleted nothing
 * is not a success (review B18), and `?add=1` opens the add dialog (Phase 1.8).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const ROW = {
  id: 'bp-1',
  systolic: 118,
  diastolic: 76,
  pulse: 62,
  log_date: '2026-06-01T00:00:00.000Z',
  measured_at: '2026-06-01T13:00:27.000Z',
  notes: 'after coffee',
};

const createBPLog = vi.fn();
const getBPLogs = vi.fn();
const deleteBPLog = vi.fn();
const notify = vi.fn();

vi.mock('../../services/bpService.js', () => ({
  bpService: {
    getBPLogs: (...a) => getBPLogs(...a),
    createBPLog: (...a) => createBPLog(...a),
    updateBPLog: vi.fn(),
    deleteBPLog: (...a) => deleteBPLog(...a),
  },
}));
vi.mock('../../services/fitnessGeekService.js', () => ({
  fitnessGeekService: { getGarminHeartRate: async () => ({ series: [] }) },
}));
vi.mock('@geeksuite/ui', async (importOriginal) => ({
  ...(await importOriginal()),
  useToast: () => ({ notify }),
  useGeekPrimaryAction: () => {},
}));
vi.mock('../../components/BloodPressure/BPChartNivo.jsx', () => ({ default: () => null }));
vi.mock('../../components/BloodPressure/BPCategoryDistribution.jsx', () => ({ default: () => null }));
vi.mock('../../components/BloodPressure/BPHRChart.jsx', () => ({ default: () => null }));
vi.mock('../../components/BloodPressure/BPReport.jsx', () => ({ default: () => null }));

const { default: BloodPressure } = await import('../BloodPressure.jsx');

const renderAt = (url = '/blood-pressure') =>
  render(<MemoryRouter initialEntries={[url]}><BloodPressure /></MemoryRouter>);

beforeEach(() => {
  notify.mockReset();
  createBPLog.mockReset().mockResolvedValue({ success: true, data: { ...ROW, id: 'bp-2' } });
  getBPLogs.mockReset().mockResolvedValue({ success: true, data: [ROW] });
  deleteBPLog.mockReset();
});

describe('BloodPressure page — delete', () => {
  it('says "Removed …" with an Undo that puts the same reading back', async () => {
    deleteBPLog.mockResolvedValue({ success: true, data: true });
    renderAt();
    const del = await screen.findAllByLabelText(/remove the 118\/76/i);
    fireEvent.click(del[0]);

    await waitFor(() => expect(notify).toHaveBeenCalledWith(
      expect.stringMatching(/^Removed 118\/76 from Jun 1$/),
      expect.objectContaining({ action: expect.anything() }),
    ));
    const [, opts] = notify.mock.calls.find(([m]) => /^Removed/.test(m));
    render(opts.action);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    await waitFor(() => expect(createBPLog).toHaveBeenCalledTimes(1));
    expect(createBPLog.mock.calls[0][0]).toMatchObject({
      systolic: 118,
      diastolic: 76,
      pulse: 62,
      date: '2026-06-01',
      measured_at: ROW.measured_at,
      notes: 'after coffee',
    });
  });

  it('a delete the server answers false is not reported as done', async () => {
    deleteBPLog.mockResolvedValue({ success: true, data: false });
    renderAt();
    const del = await screen.findAllByLabelText(/remove the 118\/76/i);
    fireEvent.click(del[0]);

    await waitFor(() => expect(notify).toHaveBeenCalled());
    const messages = notify.mock.calls.map(([m]) => m);
    expect(messages.some((m) => /removed 118|deleted successfully/i.test(m))).toBe(false);
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/couldn.t remove that reading/i), expect.objectContaining({ tone: 'error' }));
  });
});

describe('BloodPressure page — ?add=1', () => {
  it('opens the add dialog directly', async () => {
    renderAt('/blood-pressure?add=1');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Log blood pressure')).toBeInTheDocument();
  });
});
