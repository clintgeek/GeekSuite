/**
 * Review D-1 — "Is my blood pressure OK?" is answered with the week.
 *
 * The review's case: an elevated week (7-day average 126/79) whose last
 * reading happened to be a good 118/74. The page said "✓ Normal" over it,
 * and "Healthy Range 7%" in a pink tile.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

process.env.TZ = 'America/Chicago';
const { default: BPInsights } = await import('../BPInsights.jsx');
const { readingWhen } = await import('../bpTimeUtils.js');
const { default: BPCategoryDistribution } = await import('../BPCategoryDistribution.jsx');

// 14 readings over the week: 7 elevated (126/78), 6 stage 1 (131/80), and
// the newest a normal 118/74, this morning at 7:42 local.
const day = (n) => `2026-10-${String(17 - n).padStart(2, '0')}`;
const LOGS = [
  ...Array.from({ length: 7 }, (_, i) => ({ id: `e${i}`, systolic: 126, diastolic: 78, log_date: `${day(i % 6 + 1)}T00:00:00.000Z`, measured_at: `${day(i % 6 + 1)}T13:00:00.000Z` })),
  ...Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, systolic: 131, diastolic: 80, log_date: `${day(i + 1)}T00:00:00.000Z`, measured_at: `${day(i + 1)}T23:30:00.000Z` })),
  { id: 'n', systolic: 118, diastolic: 74, log_date: '2026-10-17T00:00:00.000Z', measured_at: '2026-10-17T12:42:00.000Z' },
];

describe('BPInsights headline', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-17T18:00:00-05:00'));
  });
  afterAll(() => vi.useRealTimers());

  it("leads with the week's average and its category, in plain words", () => {
    render(<BPInsights bpLogs={LOGS} />);
    expect(screen.getByTestId('bp-headline')).toHaveTextContent('Your average this week: 128/79 — a little high (elevated)');
  });

  it('then the last reading, its category and when', () => {
    render(<BPInsights bpLogs={LOGS} />);
    expect(screen.getByTestId('bp-last-reading')).toHaveTextContent(/^Last reading 118\/74 · normal · today 7:42\sAM$/);
    // No "Normal" badge over the week.
    expect(screen.queryByText('Normal')).toBeNull();
  });

  it('the healthy range is a count, not a percent', () => {
    render(<BPInsights bpLogs={LOGS} />);
    expect(screen.getByTestId('bp-healthy-range')).toHaveTextContent('Healthy range1 of 14 readings');
    expect(document.body.textContent).not.toMatch(/7%/);
  });

  it('readingWhen: yesterday, and a date-only reading shows no made-up time', () => {
    expect(readingWhen({ measured_at: '2026-10-16T23:30:00.000Z' }, '2026-10-17')).toMatch(/^yesterday 6:30\sPM$/);
    expect(readingWhen({ log_date: '2026-10-13T00:00:00.000Z', measured_at: '2026-10-13T00:00:00.000Z' }, '2026-10-17')).toBe('Oct 13');
  });
});

describe('the donut', () => {
  it('names its window and speaks plainly', () => {
    render(<BPCategoryDistribution bpLogs={LOGS} windowLabel="last 30 days" />);
    expect(screen.getByTestId('bp-donut-title')).toHaveTextContent('Readings by range, last 30 days');
    const legend = screen.getByTestId('bp-donut-legend');
    expect(legend.textContent).toBe('Normal (1)A little high (7)High (stage 1) (6)');
  });
});

describe('the BP page order', () => {
  it('puts the range toggle above the donut', async () => {
    vi.resetModules();
    vi.doMock('../../../services/bpService.js', () => ({ bpService: { getBPLogs: vi.fn(() => Promise.resolve({ success: true, data: LOGS })), getCurrentBP: vi.fn() } }));
    const { MemoryRouter } = await import('react-router-dom');
    const { default: BloodPressure } = await import('../../../pages/BloodPressure.jsx');
    render(<MemoryRouter><BloodPressure /></MemoryRouter>);
    const toggle = await screen.findByTestId('bp-range-toggle');
    const title = await screen.findByTestId('bp-donut-title', {}, { timeout: 5000 });
    expect(toggle.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(toggle).getByRole('button', { pressed: true })).toBeInTheDocument();
  });
});
