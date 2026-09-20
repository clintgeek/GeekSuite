/**
 * Progress is directional.
 *
 * `Math.abs` on both sides of the progress fraction threw the direction away,
 * so distance travelled the WRONG way counted as progress: start 200, target
 * 180, currently 210 rendered "50.0% Complete" with a half-filled bar — right
 * next to a correctly-computed "30.0 lbs to go". At 220 it read 100%.
 *
 * On a weight-loss app that is the single most misleading number on the page,
 * and it is most misleading exactly when someone is having the worst time.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

process.env.TZ = 'America/Chicago';

const { default: WeightProgress } = await import('../WeightProgress.jsx');

// Same fixture shape as weightProgressDateMixing.test.jsx: `enabled: true`
// and full ISO dates, with a frozen clock. Without those the component's
// early guards return null and every "not" assertion passes against an empty
// string — a suite that proves nothing while looking green.
const GOAL = {
  enabled: true,
  startWeight: 200,
  targetWeight: 180,
  startDate: '2026-08-01T00:00:00.000Z',
  goalDate: '2026-12-01T00:00:00.000Z',
  ratePerWeek: -1,
};

const logsEndingAt = (weight) => [
  { id: 'l1', log_date: '2026-08-15T00:00:00.000Z', weight_value: 200 },
  { id: 'l2', log_date: '2026-09-05T00:00:00.000Z', weight_value: (200 + weight) / 2 },
  { id: 'l3', log_date: '2026-09-19T00:00:00.000Z', weight_value: weight },
];

const percentTexts = () =>
  screen.queryAllByText(/\d+\.\d%\s*Complete/i).map((el) => el.textContent);

describe('WeightProgress percentage', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-19T12:00:00-05:00'));
  });
  afterAll(() => vi.useRealTimers());

  // Guard against the vacuous-pass trap: if the component renders nothing,
  // every `.not.toMatch` below would pass for the wrong reason.
  it('renders the progress card at all (guards the assertions below)', () => {
    render(
      <WeightProgress weightLogs={logsEndingAt(190)} goal={GOAL} currentWeight={190} unit="lbs" />
    );
    expect(percentTexts().length).toBeGreaterThan(0);
  });

  it('reads 0%, not 50%, when the user has gained 10 of a 20 lb loss goal', () => {
    render(
      <WeightProgress weightLogs={logsEndingAt(210)} goal={GOAL} currentWeight={210} unit="lbs" />
    );
    const texts = percentTexts().join(' ');
    expect(texts).not.toMatch(/50\.0%/);
    expect(texts).toMatch(/0\.0%/);
  });

  it('does not read 100% when the user has gained the full goal distance', () => {
    render(
      <WeightProgress weightLogs={logsEndingAt(220)} goal={GOAL} currentWeight={220} unit="lbs" />
    );
    expect(percentTexts().join(' ')).not.toMatch(/100\.0%/);
  });

  it('still reads 50% for genuine halfway progress', () => {
    // The fix must not break the case that always worked.
    render(
      <WeightProgress weightLogs={logsEndingAt(190)} goal={GOAL} currentWeight={190} unit="lbs" />
    );
    expect(percentTexts().join(' ')).toMatch(/50\.0%/);
  });

  it('reads 100% at the target', () => {
    render(
      <WeightProgress weightLogs={logsEndingAt(180)} goal={GOAL} currentWeight={180} unit="lbs" />
    );
    expect(percentTexts().join(' ')).toMatch(/100\.0%/);
  });

  it('reads 100%, not more, past the target', () => {
    render(
      <WeightProgress weightLogs={logsEndingAt(175)} goal={GOAL} currentWeight={175} unit="lbs" />
    );
    const texts = percentTexts().join(' ');
    expect(texts).toMatch(/100\.0%/);
    expect(texts).not.toMatch(/12[0-9]\.\d%/);
  });

  it('renders a maintenance goal without NaN', () => {
    // target === start is 0/0. It used to print "0.0%" on the label while
    // handing NaN to the progress bar's `value`.
    const maintain = { ...GOAL, targetWeight: 200, ratePerWeek: 0 };
    render(
      <WeightProgress weightLogs={logsEndingAt(200)} goal={maintain} currentWeight={200} unit="lbs" />
    );
    expect(screen.queryAllByText(/NaN/i)).toHaveLength(0);
  });

  it('gaining against a loss goal does not produce a tidy projected date', () => {
    // `Math.abs(remaining / rate)` turned "this rate never arrives" into a
    // confident 60-week projection.
    const gaining = [
      { id: 'l1', log_date: '2026-08-01T00:00:00.000Z', weight_value: 200 },
      { id: 'l2', log_date: '2026-09-20T00:00:00.000Z', weight_value: 212 },
    ];
    render(<WeightProgress weightLogs={gaining} goal={GOAL} currentWeight={212} unit="lbs" />);
    expect(screen.queryAllByText(/NaN|Invalid Date/i)).toHaveLength(0);
  });
});
