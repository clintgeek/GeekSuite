// The weight chart across a long gap, and with a goal set after the readings
// began (both real on 2026-09-23).
import { describe, it, expect } from 'vitest';
import { buildWeightTrend, splitAtGaps } from '../weightTrend.js';

const log = (d, v) => ({ log_date: `${d}T00:00:00.000Z`, weight_value: v });
const history = [
  log('2025-11-24', 300), log('2025-12-03', 307.5),
  log('2026-09-15', 316.8), log('2026-09-16', 317.2), log('2026-09-18', 321), log('2026-09-19', 319.6), log('2026-09-22', 318.6),
];

describe('splitAtGaps — the line breaks where nothing was measured', () => {
  it('splits at a gap longer than two weeks, keeps close points together', () => {
    const { trend } = buildWeightTrend(history);
    const stretches = splitAtGaps(trend, (p) => p.x);
    expect(stretches.map((s) => s.map((p) => p.x))).toEqual([
      ['2025-11-24', '2025-12-03'],
      ['2026-09-15', '2026-09-16', '2026-09-18', '2026-09-19', '2026-09-22'],
    ]);
  });

  it('one stretch when there is no gap', () => {
    const { trend } = buildWeightTrend(history.slice(2));
    expect(splitAtGaps(trend, (p) => p.x)).toHaveLength(1);
  });
});

describe('a goal that starts after the readings did', () => {
  // Chef's plan, set the morning of 09-23 — after every scale reading.
  const goal = { enabled: true, startDate: '2026-09-23', goalDate: '2027-09-08', startWeight: 318.6, targetWeight: 220 };

  it('still shows the current run of readings that led up to it', () => {
    const { readings, trend } = buildWeightTrend(history, { goal });
    expect(readings.map((r) => r.x)).toEqual(['2026-09-15', '2026-09-16', '2026-09-18', '2026-09-19', '2026-09-22']);
    expect(trend).toHaveLength(5);
  });

  it('but not the old run from before the gap', () => {
    const { readings } = buildWeightTrend(history, { goal });
    expect(readings.some((r) => r.x.startsWith('2025'))).toBe(false);
  });

  it('no projection from one week of readings, whatever the history before the gap', () => {
    expect(buildWeightTrend(history, { goal }).projection).toBeNull();
  });
});
