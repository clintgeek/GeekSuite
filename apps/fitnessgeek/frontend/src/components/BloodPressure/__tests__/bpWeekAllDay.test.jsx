/**
 * "Your average this week" is the same week all day.
 *
 * The 7-day window compared `log_date` (a calendar day stored at UTC
 * midnight) with "this instant minus 7 days". West of UTC that put the
 * week's first day in before 18:00 and out after it, so the headline
 * average changed with the clock: 128/79 at noon, 127/79 at 21:00 (harness
 * 67-bp-week, red in Chicago evenings, 2026-11-15).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

process.env.TZ = 'America/Chicago';
const { default: BPInsights } = await import('../BPInsights.jsx');

const day = (n) => `2026-10-${String(17 - n).padStart(2, '0')}`;
const LOGS = [
  ...Array.from({ length: 7 }, (_, i) => ({ id: `e${i}`, systolic: 126, diastolic: 78, log_date: `${day(i % 6 + 1)}T00:00:00.000Z`, measured_at: `${day(i % 6 + 1)}T13:00:00.000Z` })),
  ...Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, systolic: 131, diastolic: 80, log_date: `${day(i + 1)}T00:00:00.000Z`, measured_at: `${day(i + 1)}T23:30:00.000Z` })),
  { id: 'n', systolic: 118, diastolic: 74, log_date: '2026-10-17T00:00:00.000Z', measured_at: '2026-10-17T12:42:00.000Z' },
  // Day 7 is outside "this week" at any hour.
  { id: 'old', systolic: 160, diastolic: 100, log_date: '2026-10-10T00:00:00.000Z', measured_at: '2026-10-10T13:00:00.000Z' },
];

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('the week average does not move with the clock', () => {
  it.each(['08:00', '12:00', '18:30', '21:00', '23:59'])('at %s local it is the same 7 calendar days', (hhmm) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`2026-10-17T${hhmm}:00-05:00`));
    render(<BPInsights bpLogs={LOGS} />);
    expect(screen.getByTestId('bp-now')).toHaveTextContent('128/79');
    expect(screen.getByTestId('bp-headline')).toHaveTextContent('Your average this week is a little high.');
  });
});
