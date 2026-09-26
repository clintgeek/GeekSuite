/**
 * thinggeekDates.test.js — "what's expiring or due?"
 *
 *   - daysUntil counts whole UTC calendar days from today (negative = past);
 *   - status: overdue (<0) | soon (≤30) | upcoming (≤90) | later;
 *   - a past RECURRING date counts as its next occurrence (anchor + k·N
 *     months, clamped at month end, computed from the anchor so it never
 *     drifts) — and the stored anchor is never rewritten;
 *   - nextDue: the earliest occurrence ≥ today, else the most overdue;
 *   - the JS rules (field resolvers) and the Mongo expressions (filters,
 *     sorts, attention) agree, date for date.
 */
import {
  startHarness,
  stopHarness,
  cleanAll,
  ok,
  createThing,
  dayFromToday,
  Thing,
  UPDATE_THING,
} from './thinggeekHarness.js';

const { occurrenceOf, daysUntil, statusOf, nextDueOf, occurrenceStages, addMonthsClamped } = await import('../graphql/thinggeek/dates.js');

beforeAll(startHarness, 60000);
beforeEach(cleanAll);
afterAll(async () => {
  await cleanAll();
  await stopHarness();
});

const day = (s) => new Date(`${s}T00:00:00.000Z`);

describe('the rules, in JS', () => {
  test('daysUntil and status thresholds', () => {
    const today = day('2026-09-25');
    const cases = [
      ['2026-09-24', -1, 'overdue'],
      ['2026-09-25', 0, 'soon'],
      ['2026-10-25', 30, 'soon'],
      ['2026-10-26', 31, 'upcoming'],
      ['2026-12-24', 90, 'upcoming'],
      ['2026-12-25', 91, 'later'],
    ];
    for (const [d, n, status] of cases) {
      expect(daysUntil(day(d), today)).toBe(n);
      expect(statusOf(n)).toBe(status);
    }
  });

  test('one-off dates are their own occurrence, past or future', () => {
    const today = day('2026-09-25');
    expect(occurrenceOf({ date: day('2025-01-01') }, today)).toEqual(day('2025-01-01'));
    expect(occurrenceOf({ date: day('2027-01-01') }, today)).toEqual(day('2027-01-01'));
  });

  test('a past recurring date counts as its NEXT occurrence', () => {
    const today = day('2026-09-25');
    // Oil change every 6 months from 2026-01-01: Jul 1 is past too, so Jan 1 2027.
    expect(occurrenceOf({ date: day('2026-01-01'), recurEveryMonths: 6 }, today)).toEqual(day('2027-01-01'));
    // Yearly registration from 2020-09-25 falls due TODAY (0 days, not overdue).
    expect(occurrenceOf({ date: day('2020-09-25'), recurEveryMonths: 12 }, today)).toEqual(day('2026-09-25'));
    // ...and one day earlier in the year has already rolled to next year.
    expect(occurrenceOf({ date: day('2020-09-24'), recurEveryMonths: 12 }, today)).toEqual(day('2027-09-24'));
    // A future recurring date is itself.
    expect(occurrenceOf({ date: day('2026-10-01'), recurEveryMonths: 1 }, today)).toEqual(day('2026-10-01'));
  });

  test('month-end clamping is computed from the anchor, so it never drifts', () => {
    expect(addMonthsClamped(day('2026-01-31'), 1)).toEqual(day('2026-02-28'));
    expect(addMonthsClamped(day('2026-01-31'), 2)).toEqual(day('2026-03-31'));
    expect(addMonthsClamped(day('2024-02-29'), 12)).toEqual(day('2025-02-28'));
    expect(occurrenceOf({ date: day('2026-01-31'), recurEveryMonths: 1 }, day('2026-03-01'))).toEqual(day('2026-03-31'));
    expect(occurrenceOf({ date: day('2026-01-31'), recurEveryMonths: 1 }, day('2026-02-28'))).toEqual(day('2026-02-28'));
  });

  test('nextDue: earliest upcoming, else the most overdue', () => {
    const today = day('2026-09-25');
    const dates = [
      { _id: 'a', date: day('2026-08-01') },
      { _id: 'b', date: day('2026-12-01') },
      { _id: 'c', date: day('2026-10-01') },
    ];
    expect(nextDueOf(dates, today)._id).toBe('c');
    expect(nextDueOf([{ _id: 'x', date: day('2026-01-01') }, { _id: 'y', date: day('2025-01-01') }], today)._id).toBe('y');
    expect(nextDueOf([], today)).toBeNull();
  });
});

describe('the Mongo expressions agree with the JS', () => {
  test.each(['2026-09-25', '2026-03-01', '2026-02-28', '2024-02-29', '2026-12-31', '2027-01-01'])('today = %s', async (todayStr) => {
    const today = day(todayStr);
    const anchors = [
      ['2020-01-31', 1],
      ['2020-01-31', 3],
      ['2024-02-29', 12],
      ['2026-01-01', 6],
      ['2025-09-25', 12],
      ['2025-09-24', 12],
      ['2019-05-15', 7],
      ['2030-01-01', 12],
      ['2026-01-01', null],
      ['2028-06-30', null],
      [todayStr, 1],
    ];
    const dates = anchors.map(([d, n]) => ({ kind: 'other', date: day(d), recurEveryMonths: n }));
    const { insertedId } = await Thing.collection.insertOne({ householdId: 'dates-test', name: 'x', dates, deletedAt: null });
    const [row] = await Thing.aggregate([{ $match: { _id: insertedId } }, ...occurrenceStages(today)]);
    expect(row.__occ).toEqual(dates.map((d) => occurrenceOf(d, today)));
    expect(row.__nextDue).toEqual(nextDueOf(dates, today).occursOn);
  });
});

describe('over GraphQL', () => {
  test('dates render daysUntil/status, sorted by occurrence; nextDue; the anchor is not rewritten', async () => {
    const t = await createThing({
      name: 'Wendy',
      dates: [
        { kind: 'insurance', label: 'Policy', date: dayFromToday(45) },
        { kind: 'registration', date: dayFromToday(-3) },
        { kind: 'maintenance', label: 'Oil', date: dayFromToday(-400), recurEveryMonths: 1 },
        { kind: 'warranty', date: dayFromToday(200) },
      ],
    });
    const byKind = Object.fromEntries(t.dates.map((d) => [d.kind, d]));
    expect(byKind.registration).toMatchObject({ daysUntil: -3, status: 'overdue' });
    expect(byKind.insurance).toMatchObject({ daysUntil: 45, status: 'upcoming', label: 'Policy' });
    expect(byKind.warranty).toMatchObject({ daysUntil: 200, status: 'later' });
    expect(byKind.maintenance.daysUntil).toBeGreaterThanOrEqual(0);
    expect(byKind.maintenance.daysUntil).toBeLessThanOrEqual(31);
    expect(byKind.maintenance.recurEveryMonths).toBe(1);
    // The stored anchor round-trips unchanged.
    expect(byKind.maintenance.date.slice(0, 10)).toBe(dayFromToday(-400));
    expect(t.dates.map((d) => d.kind)).toEqual(['registration', 'maintenance', 'insurance', 'warranty']);
    expect(t.nextDue.kind).toBe('maintenance');

    const stored = await Thing.findById(t.id).lean();
    expect(stored.dates.find((d) => d.kind === 'maintenance').date.toISOString().slice(0, 10)).toBe(dayFromToday(-400));

    // Only past one-offs → nextDue is the most overdue.
    const past = (await ok(UPDATE_THING, {
      id: t.id,
      input: { dates: [{ kind: 'license', date: dayFromToday(-10) }, { kind: 'other', date: dayFromToday(-50) }] },
    })).updateThing;
    expect(past.nextDue).toMatchObject({ kind: 'other', daysUntil: -50, status: 'overdue' });
    const none = (await ok(UPDATE_THING, { id: t.id, input: { dates: [] } })).updateThing;
    expect(none.nextDue).toBeNull();
  });

  test('a date id round-trips (an edit keeps the same date id)', async () => {
    const t = await createThing({ name: 'x', dates: [{ kind: 'warranty', date: dayFromToday(10) }] });
    const id = t.dates[0].id;
    const upd = (await ok(UPDATE_THING, { id: t.id, input: { dates: [{ id, kind: 'warranty', label: 'Ext', date: dayFromToday(20) }] } })).updateThing;
    expect(upd.dates).toEqual([expect.objectContaining({ id, label: 'Ext', daysUntil: 20 })]);
  });

  test('thingAttention: overdue and next-30-days lists sorted by date, with missing counts', async () => {
    await createThing({ name: 'Late B', dates: [{ kind: 'license', date: dayFromToday(-2) }] });
    await createThing({ name: 'Late A', dates: [{ kind: 'license', date: dayFromToday(-20) }] });
    await createThing({ name: 'Soon 2', dates: [{ kind: 'warranty', date: dayFromToday(25) }], value: { amount: 10 } });
    await createThing({ name: 'Soon 1', dates: [{ kind: 'warranty', date: dayFromToday(0) }] });
    await createThing({ name: 'Later', dates: [{ kind: 'warranty', date: dayFromToday(31) }] });
    // Recurring, anchor 300 days back: next occurrence ~65 days out — neither overdue nor due soon.
    await createThing({ name: 'Recurs', dates: [{ kind: 'maintenance', date: dayFromToday(-300), recurEveryMonths: 12 }] });
    const gone = await createThing({ name: 'Trashed', dates: [{ kind: 'license', date: dayFromToday(-1) }] });
    await ok(`mutation($id: ID!) { deleteThing(id: $id) { success } }`, { id: gone.id });

    const a = (await ok(`query { thingAttention { overdue { name } dueSoon { name } missingPhoto missingValue missingReceipt missingSerial missingIdPlate } }`)).thingAttention;
    expect(a.overdue.map((t) => t.name)).toEqual(['Late A', 'Late B']);
    expect(a.dueSoon.map((t) => t.name)).toEqual(['Soon 1', 'Soon 2']);
    expect(a).toMatchObject({ missingPhoto: 6, missingValue: 5, missingReceipt: 6, missingSerial: 0, missingIdPlate: 0 });
  });
});
