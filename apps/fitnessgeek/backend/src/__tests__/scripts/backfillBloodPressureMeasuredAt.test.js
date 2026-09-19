import { describe, test, expect } from '@jest/globals';
import { planBackfill } from '../../../scripts/backfillBloodPressureMeasuredAt.js';

// Hermetic — no Mongo. `planBackfill` takes the plain row shape the
// migration's own `find()` projection returns, so this drives every branch
// with no connection at all (same pattern as fixBarcodeUniqueIndex.test.js).

describe('backfillBloodPressureMeasuredAt — planBackfill', () => {
  test('a single row gets measured_at seeded from its own log_date', () => {
    const plan = planBackfill([
      { _id: 'a', userId: 'u1', log_date: new Date('2026-09-16T00:00:00.000Z') },
    ]);
    expect(plan).toEqual([
      { _id: 'a', measured_at: new Date('2026-09-16T00:00:00.000Z') },
    ]);
  });

  test('two different users on the same log_date do not collide with each other', () => {
    const plan = planBackfill([
      { _id: 'a', userId: 'u1', log_date: new Date('2026-09-16T00:00:00.000Z') },
      { _id: 'b', userId: 'u2', log_date: new Date('2026-09-16T00:00:00.000Z') },
    ]);
    expect(plan.find((p) => p._id === 'a').measured_at).toEqual(
      new Date('2026-09-16T00:00:00.000Z')
    );
    expect(plan.find((p) => p._id === 'b').measured_at).toEqual(
      new Date('2026-09-16T00:00:00.000Z')
    );
  });

  test('one user, distinct log_dates, each keeps its own day at midnight', () => {
    const plan = planBackfill([
      { _id: 'a', userId: 'u1', log_date: new Date('2026-09-15T00:00:00.000Z') },
      { _id: 'b', userId: 'u1', log_date: new Date('2026-09-16T00:00:00.000Z') },
    ]);
    expect(plan.find((p) => p._id === 'a').measured_at).toEqual(
      new Date('2026-09-15T00:00:00.000Z')
    );
    expect(plan.find((p) => p._id === 'b').measured_at).toEqual(
      new Date('2026-09-16T00:00:00.000Z')
    );
  });

  test('a same-user, same-log_date pair (a pre-existing GraphQL-written duplicate) is nudged apart', () => {
    // The scenario the migration's header names: the REST controller always
    // enforced one-per-day, but basegeek's `addBloodPressure` resolver never
    // did, so history can already contain two rows for one user on one day.
    // Both must survive the backfill with DISTINCT measured_at values.
    const plan = planBackfill([
      { _id: 'a', userId: 'u1', log_date: new Date('2026-09-16T00:00:00.000Z') },
      { _id: 'b', userId: 'u1', log_date: new Date('2026-09-16T00:00:00.000Z') },
    ]);
    const values = plan.map((p) => p.measured_at.getTime());
    expect(new Set(values).size).toBe(2);
    expect(plan.find((p) => p._id === 'a').measured_at).toEqual(
      new Date('2026-09-16T00:00:00.000Z')
    );
    expect(plan.find((p) => p._id === 'b').measured_at).toEqual(
      new Date('2026-09-16T00:00:01.000Z')
    );
  });

  test('three same-user, same-log_date rows each get a distinct, one-second-apart instant', () => {
    const plan = planBackfill([
      { _id: 'a', userId: 'u1', log_date: new Date('2026-09-16T00:00:00.000Z') },
      { _id: 'b', userId: 'u1', log_date: new Date('2026-09-16T00:00:00.000Z') },
      { _id: 'c', userId: 'u1', log_date: new Date('2026-09-16T00:00:00.000Z') },
    ]);
    const values = plan.map((p) => p.measured_at.getTime()).sort();
    expect(new Set(values).size).toBe(3);
    expect(values).toEqual([
      new Date('2026-09-16T00:00:00.000Z').getTime(),
      new Date('2026-09-16T00:00:01.000Z').getTime(),
      new Date('2026-09-16T00:00:02.000Z').getTime(),
    ]);
  });

  test('an empty row list plans nothing', () => {
    expect(planBackfill([])).toEqual([]);
  });
});
