/**
 * "Readings by range" is labelled bars (round two).
 *
 * It was a donut: three coloured arcs with a bare count on each and the
 * legend below the fold on a phone, so the colours had no key in view. Each
 * range now says its own name and count on the row its bar is on.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import BPCategoryDistribution from '../BPCategoryDistribution.jsx';

const reading = (id, systolic, diastolic) => ({ id, systolic, diastolic, log_date: '2026-10-10T00:00:00.000Z' });
const LOGS = [
  reading('a', 150, 95), // stage 2
  reading('b', 118, 74), // normal
  reading('c', 126, 78), // a little high
  reading('d', 126, 78),
  reading('e', 131, 80), // stage 1
  null,                  // a partial record is skipped, not a crash
];

describe('BPCategoryDistribution', () => {
  it('lists each range that has readings, mildest first, in words with its count', () => {
    render(<BPCategoryDistribution bpLogs={LOGS} windowLabel="last 30 days" />);
    const rows = within(screen.getByTestId('bp-donut-legend')).getAllByTestId('bp-range-row');
    expect(rows.map((r) => r.textContent)).toEqual([
      'Normal1 reading',
      'A little high2 readings',
      'High (stage 1)1 reading',
      'High (stage 2)1 reading',
    ]);
  });

  it('the bars are decoration: the words are what a screen reader gets', () => {
    render(<BPCategoryDistribution bpLogs={LOGS} />);
    const row = screen.getAllByTestId('bp-range-row')[1];
    const hidden = row.querySelectorAll('[aria-hidden="true"]');
    expect(hidden.length).toBe(2); // the dot and the bar
    expect(screen.queryByRole('img')).toBeNull();
  });

  it("each bar is its range's share of the readings", () => {
    render(<BPCategoryDistribution bpLogs={LOGS} />);
    const fill = screen.getAllByTestId('bp-range-row')[1].querySelector('[aria-hidden="true"]:last-child > div');
    expect(fill).toHaveStyle({ width: '40%' }); // 2 of 5
  });

  it('with no readings in the window it says so', () => {
    render(<BPCategoryDistribution bpLogs={[]} windowLabel="last 7 days" />);
    expect(screen.getByText('No readings in the last 7 days')).toBeInTheDocument();
  });
});
