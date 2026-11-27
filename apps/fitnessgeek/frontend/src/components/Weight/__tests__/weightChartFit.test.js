/**
 * The trend chart's x-range is the weigh-ins' (round two).
 *
 * The reviewer's case: a goal set for Aug 1 → Dec 1 with weigh-ins from
 * Sep 19. The goal line was drawn from Aug 1, so the first third of the chart
 * was empty and the data sat in the right-hand half.
 */
import { describe, it, expect } from 'vitest';
import { buildWeightTrend, fitToWeighIns, programPace } from '../weightTrend.js';

const iso = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString();
const GOAL = { enabled: true, startWeight: 232, targetWeight: 195, startDate: iso(2026, 8, 1), goalDate: iso(2026, 12, 1) };
// Daily from Sep 19, 1.3 lb a week down.
const logs = (days) => Array.from({ length: days }, (_, i) => ({
  log_date: new Date(Date.UTC(2026, 8, 19 + i)).toISOString(),
  weight_value: Math.round((232 - (1.3 / 7) * i) * 10) / 10,
}));

describe('fitToWeighIns', () => {
  it('starts the goal line at the first weigh-in, not at the goal start', () => {
    const model = buildWeightTrend(logs(70), { goal: GOAL, today: '2026-11-27' });
    expect(model.goalLine[0].x).toBe('2026-08-01'); // the model is unchanged
    const fit = fitToWeighIns(model);
    expect(fit.from).toBe('2026-09-19');
    expect(fit.goalLine[0].x).toBe('2026-09-19');
    // The same line, seen through a narrower window: 49 of 122 days along.
    expect(fit.goalLine[0].y).toBeCloseTo(232 - 37 * (49 / 122), 1);
  });

  it('runs on to the goal date when it is near, and the line ends on the target', () => {
    const fit = fitToWeighIns(buildWeightTrend(logs(70), { goal: GOAL, today: '2026-11-27' }));
    expect(fit.to).toBe('2026-12-01'); // 4 days after the last weigh-in
    expect(fit.goalLine[1]).toEqual({ x: '2026-12-01', y: 195 });
  });

  it('stops at the last weigh-in when the goal date is far off, clipping both guides', () => {
    const far = { ...GOAL, goalDate: iso(2027, 6, 1) };
    const model = buildWeightTrend(logs(40), { goal: far, today: '2026-10-28' });
    expect(model.projection).not.toBeNull();
    const fit = fitToWeighIns(model);
    expect(fit.to).toBe('2026-10-28');
    expect(fit.goalLine[1].x).toBe('2026-10-28');
    expect(fit.goalLine[1].y).toBeGreaterThan(195); // partway down, not the target
    // "At this pace" starts at the last weigh-in, so none of it is in view.
    expect(fit.projection).toBeNull();
  });

  it('leaves a first few weigh-ins alone: the plan is the picture', () => {
    const model = buildWeightTrend(logs(5), { goal: { ...GOAL, startDate: iso(2026, 9, 19) }, today: '2026-09-23' });
    const fit = fitToWeighIns(model);
    expect(fit.goalLine).toEqual(model.goalLine);
  });

  it('with no goal there is nothing to clip', () => {
    const fit = fitToWeighIns(buildWeightTrend(logs(30)));
    expect(fit.goalLine).toBeNull();
    expect(fit.projection).toBeNull();
    expect(fit.from).toBe('2026-09-19');
  });

  it('no weigh-ins: nothing', () => {
    expect(fitToWeighIns(buildWeightTrend([]))).toEqual({ goalLine: null, projection: null, from: null, to: null });
  });
});

describe('programPace.finishDate', () => {
  it('is where the slope lands even when that is too far to print as a day', () => {
    const goal = { ...GOAL, startDate: iso(2026, 9, 19) };
    const pace = programPace(logs(70), goal, { today: '2026-11-27' });
    expect(pace.tooFar).toBe(true);
    expect(pace.projectedDate).toBeNull(); // the rule the cards and chart share is unchanged
    expect(pace.finishDate).toMatch(/^2027-0[3-5]-\d\d$/);
  });

  it('matches projectedDate when the finish is near enough to name', () => {
    const pace = programPace(logs(70), { ...GOAL, startDate: iso(2026, 6, 18) }, { today: '2026-11-27' });
    if (pace.projectedDate) expect(pace.finishDate).toBe(pace.projectedDate);
    expect(pace.finishDate).not.toBeNull();
  });
});
