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
const { default: BPInsights, bpSummarySentence } = await import('../BPInsights.jsx');
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
    expect(screen.getByTestId('bp-now')).toHaveTextContent('128/79');
    expect(screen.getByText('A little high')).toBeInTheDocument();
    // ONE sentence squares the week with the latest reading (round two): the
    // card used to say "A little high", then "Last reading… normal", and
    // leave the person to work out which was true.
    expect(screen.getByTestId('bp-headline')).toHaveTextContent(/^Your average for the last 7 days is a little high\. Your last reading, today 7:42\sAM, was normal\.$/);
  });

  // Round three: 126/79 stood unlabelled over "this week" and a row called
  // "30-day average". The number is named right above itself, and the
  // sentence and rows use the same words for the same windows.
  it('names the big number right above it, in the words the sentence and rows use', () => {
    render(<BPInsights bpLogs={LOGS} />);
    const label = screen.getByTestId('bp-now-label');
    expect(label).toHaveTextContent(/^Average, last 7 days$/);
    expect(label.compareDocumentPosition(screen.getByTestId('bp-now')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(label.parentElement).toBe(screen.getByTestId('bp-now').parentElement);
    expect(screen.getByText('Average, last 30 days')).toBeInTheDocument();
    expect(screen.getByText('Trend, last 30 days')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/this week|30-day/i);
  });

  it('with no readings in the last 7 days the big number is the last reading, and says so', () => {
    const old = [{ id: 'o', systolic: 121, diastolic: 79, log_date: '2026-09-01T00:00:00.000Z', measured_at: '2026-09-01T13:00:00.000Z' }];
    render(<BPInsights bpLogs={old} />);
    expect(screen.getByTestId('bp-now-label')).toHaveTextContent(/^Last reading$/);
    expect(screen.getByTestId('bp-now')).toHaveTextContent('121/79');
  });

  it('says "so was your last reading" when the two agree, and names the gap when the week is empty', () => {
    expect(bpSummarySentence({ weekStage: 'Elevated', lastStage: 'Elevated', lastWhen: 'yesterday 6:30 PM' }))
      .toBe('Your average for the last 7 days is a little high. So was your last reading, yesterday 6:30 PM.');
    expect(bpSummarySentence({ weekStage: null, lastStage: 'Stage 1', lastWhen: 'Oct 3' }))
      .toBe('No readings in the last 7 days. Your last one, Oct 3, was high.');
  });

  it('a little high or stage 1 gets one calm line of guidance; a normal week gets none', () => {
    const { unmount } = render(<BPInsights bpLogs={LOGS} />);
    expect(screen.getByTestId('bp-guidance')).toHaveTextContent('A little above normal. Nothing urgent; it’s worth keeping an eye on.');
    unmount();
    render(<BPInsights bpLogs={LOGS.map((l) => ({ ...l, systolic: 112, diastolic: 72 }))} />);
    expect(screen.queryByTestId('bp-guidance')).toBeNull();
  });

  it('then the last reading, its category and when', () => {
    render(<BPInsights bpLogs={LOGS} />);
    expect(screen.getByTestId('bp-last-reading')).toHaveTextContent(/^Last reading 118\/74 · normal · today 7:42\sAM$/);
    // No "Normal" badge over the week.
    expect(screen.queryByText('Normal')).toBeNull();
  });

  it('the healthy range is a count, not a percent', () => {
    render(<BPInsights bpLogs={LOGS} />);
    // …and it is the same 30 days as the average in the row above it.
    expect(screen.getByTestId('bp-healthy-range')).toHaveTextContent('In the normal range 1 of 14 readings · last 30 days');
    expect(document.body.textContent).not.toMatch(/7%/);
  });

  it('counts normal readings over the last 30 days, not every reading ever', () => {
    const old = Array.from({ length: 5 }, (_, i) => ({ id: `o${i}`, systolic: 110, diastolic: 70, log_date: `2026-06-0${i + 1}T00:00:00.000Z`, measured_at: `2026-06-0${i + 1}T13:00:00.000Z` }));
    render(<BPInsights bpLogs={[...LOGS, ...old]} />);
    expect(screen.getByTestId('bp-healthy-range')).toHaveTextContent('1 of 14 readings · last 30 days');
  });

  it('A5: the heart is not basil when the week is a little high, and the 7-day figure is said once', () => {
    render(<BPInsights bpLogs={LOGS} />);
    expect(screen.getByTestId('bp-heart')).toHaveAttribute('data-tone', 'raised');
    // (The 30-day tile stays; in this fixture it happens to be 128/79 too.)
    expect(screen.queryByText('7-day average')).toBeNull();
  });

  it('A5: a normal week keeps the basil heart', () => {
    const normal = LOGS.map((l) => ({ ...l, systolic: 112, diastolic: 72 }));
    render(<BPInsights bpLogs={normal} />);
    expect(screen.getByTestId('bp-heart')).toHaveAttribute('data-tone', 'normal');
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
    // Labelled bars (round two): every range says its own name and count,
    // in view, with no colour to decode.
    const rows = within(screen.getByTestId('bp-donut-legend')).getAllByTestId('bp-range-row');
    expect(rows.map((r) => r.textContent)).toEqual(['Normal1 reading', 'A little high7 readings', 'High (stage 1)6 readings']);
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

  // The plan said "last 30 days"; a week of readings opened on 7d (d-fixes).
  it('opens on the last 30 days, even with a week of readings', async () => {
    vi.resetModules();
    vi.doMock('../../../services/bpService.js', () => ({ bpService: { getBPLogs: vi.fn(() => Promise.resolve({ success: true, data: LOGS })), getCurrentBP: vi.fn() } }));
    const { MemoryRouter } = await import('react-router-dom');
    const { default: BloodPressure } = await import('../../../pages/BloodPressure.jsx');
    render(<MemoryRouter><BloodPressure /></MemoryRouter>);
    const toggle = await screen.findByTestId('bp-range-toggle');
    expect(await screen.findByTestId('bp-donut-title', {}, { timeout: 5000 })).toHaveTextContent('Readings by range, last 30 days');
    expect(within(toggle).getByRole('button', { pressed: true })).toHaveAccessibleName('30 days');
    // Whole words on the buttons themselves, never "7d" (shared decision).
    expect(within(toggle).getAllByRole('button').map((b) => b.textContent)).toEqual(['7 days', '30 days', '1 year', 'All']);
  });
});
