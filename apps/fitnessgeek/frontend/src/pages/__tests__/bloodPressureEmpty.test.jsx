/**
 * A brand-new account's BP page has a first step of its own, in the page. On
 * a phone the only way in used to be the floating button, which sits outside
 * the page (and left axe a scrolling region with nothing focusable, CI
 * 2026-10-17).
 *
 * And a FAILED load is not a brand-new account: it used to draw the same "No
 * readings yet" with only a toast to say otherwise.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GeekToastProvider } from '@geeksuite/ui';

const getBPLogs = vi.fn();
vi.mock('../../services/bpService.js', () => ({
  bpService: { getBPLogs: (...a) => getBPLogs(...a) },
}));
vi.mock('../../services/fitnessGeekService.js', () => ({
  fitnessGeekService: { getGarminHeartRate: vi.fn(async () => null) },
}));
vi.mock('../../components/BloodPressure/BPChartNivo.jsx', () => ({ default: () => null }));
vi.mock('../../components/BloodPressure/BPCategoryDistribution.jsx', () => ({ default: () => null }));
vi.mock('../../components/BloodPressure/BPHRChart.jsx', () => ({ default: () => null }));

const { default: BloodPressure } = await import('../BloodPressure.jsx');

const renderPage = () => render(<GeekToastProvider><MemoryRouter><BloodPressure /></MemoryRouter></GeekToastProvider>);

const READING = { id: 'b1', systolic: 118, diastolic: 76, pulse: 64, log_date: '2026-10-15T00:00:00.000Z', measured_at: '2026-10-15T12:30:00.000Z' };

beforeEach(() => {
  getBPLogs.mockReset();
});

describe('BP page with no readings', () => {
  it('says so once, and its one button opens the add form', async () => {
    getBPLogs.mockResolvedValue({ success: true, data: [] });
    renderPage();
    expect(await screen.findByText('No readings yet')).toBeInTheDocument();
    // Said once, not twice (the readings list's own empty card is hidden).
    expect(screen.getAllByText('No readings yet')).toHaveLength(1);
    // One way in, not two: the old empty card had its own second button.
    expect(screen.queryByRole('button', { name: 'Log your first reading' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Log blood pressure' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});

describe('BP page when the readings fail to load', () => {
  it('a soft failure says the readings did not load, never "No readings yet"', async () => {
    getBPLogs.mockResolvedValue({ success: false });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(/your readings didn.t load/i);
    expect(screen.queryByText('No readings yet')).toBeNull();
  });

  it('a thrown failure does the same, and Try again loads the readings', async () => {
    getBPLogs.mockRejectedValueOnce(new Error('Network Error'));
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/your readings didn.t load/i);
    expect(screen.queryByText('No readings yet')).toBeNull();

    getBPLogs.mockResolvedValue({ success: true, data: [READING] });
    fireEvent.click(within(alert).getByRole('button', { name: /try again/i }));
    expect(await screen.findByTestId('bp-log-row')).toHaveTextContent('118/76');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a null row in the answer is skipped, not a crash', async () => {
    getBPLogs.mockResolvedValue({ success: true, data: [null, READING, { id: 'b2', log_date: '2026-10-14T00:00:00.000Z' }] });
    renderPage();
    expect(await screen.findAllByTestId('bp-log-row')).toHaveLength(1);
  });
});
