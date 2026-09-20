/**
 * `bpService.updateBPLog` already existed — the PUT route, the controller,
 * the frontend service method were all wired — but nothing in the UI ever
 * called it. A typo in a blood pressure reading meant delete-and-retype,
 * which also lost the deleted reading's place in the day. This test drives
 * the actual page: click a row's edit control, change a value, save, and
 * confirm the wire call was `updateBPLog` (a PUT to the existing row) and
 * NOT `createBPLog` (which would silently leave the typo'd original in place
 * alongside a new, separate row).
 *
 * Heavy chart children (Nivo/Recharts/jsPDF, all lazy-loaded on this page)
 * are stubbed out — this test is about the edit wire, not about rendering a
 * chart in jsdom.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const EXISTING = {
  id: 'bp-1',
  systolic: 118,
  diastolic: 76,
  pulse: 62,
  log_date: '2026-06-01T00:00:00.000Z',
  measured_at: '2026-06-01T13:00:00.000Z',
};

const updateBPLog = vi.fn(async () => ({ success: true, data: { ...EXISTING, systolic: 150 } }));
const createBPLog = vi.fn(async () => ({ success: true, data: EXISTING }));
const getBPLogs = vi.fn(async () => ({ success: true, data: [EXISTING] }));
const deleteBPLog = vi.fn(async () => ({ success: true }));

vi.mock('../../services/bpService.js', () => ({
  bpService: {
    getBPLogs: (...args) => getBPLogs(...args),
    createBPLog: (...args) => createBPLog(...args),
    updateBPLog: (...args) => updateBPLog(...args),
    deleteBPLog: (...args) => deleteBPLog(...args),
    getBPStats: async () => ({ success: true, data: {} }),
  },
}));

vi.mock('../../services/fitnessGeekService.js', () => ({
  fitnessGeekService: {
    getGarminHeartRate: async () => ({ series: [] }),
  },
}));

vi.mock('@geeksuite/ui', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useToast: () => ({ notify: vi.fn() }) };
});

// Lazy-loaded chart/report children — irrelevant to the edit wire, and
// several pull in heavy chart libs (Nivo, Recharts, jsPDF) that don't render
// meaningfully in jsdom anyway.
vi.mock('../../components/BloodPressure/BPChartNivo.jsx', () => ({ default: () => null }));
vi.mock('../../components/BloodPressure/BPCategoryDistribution.jsx', () => ({ default: () => null }));
vi.mock('../../components/BloodPressure/BPHRChart.jsx', () => ({ default: () => null }));
vi.mock('../../components/BloodPressure/BPReport.jsx', () => ({ default: () => null }));

const { default: BloodPressure } = await import('../BloodPressure.jsx');

describe('BloodPressure page — editing a row', () => {
  it('saves through updateBPLog, not createBPLog', async () => {
    const user = userEvent.setup();
    render(<BloodPressure />);

    // Wait for the initial load to land the one reading.
    await screen.findAllByText(/118\/76/);

    const editButtons = screen.getAllByRole('button', { name: /edit the 118\/76 mmhg reading/i });
    await user.click(editButtons[0]);

    // QuickAddBP's own desktop card also has a "Systolic" field, always
    // mounted — scope the query to the edit dialog so this isn't ambiguous.
    const dialog = await screen.findByRole('dialog');
    const dialogSystolic = within(dialog).getByLabelText(/^systolic$/i);

    // The fields are seeded from an effect keyed on `open`/`initialValues`,
    // so wait for the value rather than asserting immediately on the
    // element's first appearance.
    await waitFor(() => expect(dialogSystolic).toHaveValue(118));

    await user.clear(dialogSystolic);
    await user.type(dialogSystolic, '150');

    const saveButton = within(dialog).getByRole('button', { name: /save/i });
    await user.click(saveButton);

    expect(updateBPLog).toHaveBeenCalledTimes(1);
    expect(updateBPLog.mock.calls[0][0]).toBe('bp-1');
    expect(updateBPLog.mock.calls[0][1]).toMatchObject({ systolic: 150, diastolic: 76 });
    expect(createBPLog).not.toHaveBeenCalled();
  });
});
