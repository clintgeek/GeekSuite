/**
 * Materialised overrides, pinned — the recurrence group from
 * DOCS/BUJOGEEK_REVIEW_2026-09.md §2.
 *
 * These were all latent: the live database held zero series masters, so none
 * of it had ever fired. They arm together the first time a repeating task
 * exists, which is why they are closed as a set.
 */
import taskService from '../graphql/bujogeek/services/taskService.js';

// A master standing in for "stretch, daily, from 2026-03-15".
const master = {
  _id: '507f1f77bcf86cd799439011',
  createdBy: 'u1',
  content: 'stretch',
  status: 'pending',
  dueDate: new Date('2026-03-15T09:00:00.000Z'),
  recurrenceRule: 'DTSTART:20260315T090000Z\nRRULE:FREQ=DAILY',
  isSeriesMaster: true,
  exdates: [],
  toObject() {
    const { toObject, ...rest } = this;
    return { ...rest };
  },
};

describe('buildOverride files the occurrence under its OWN date', () => {
  const occurrence = new Date('2026-03-17T09:00:00.000Z');

  it('takes its dueDate from the occurrence, not the series start', () => {
    // The bug: `...master.toObject()` carried the master's dueDate, and a
    // status change supplies none — so completing Tuesday's occurrence wrote
    // a row dated to the series' FIRST day.
    const override = taskService.buildOverride(master, occurrence, {
      status: 'completed',
      completedAt: new Date('2026-03-17T10:00:00.000Z'),
    });

    expect(override.dueDate).toEqual(occurrence);
    expect(override.dueDate).not.toEqual(master.dueDate);
  });

  it('still records which occurrence it overrides', () => {
    const override = taskService.buildOverride(master, occurrence, { status: 'completed' });
    expect(override.originalDueDate).toEqual(occurrence);
  });

  it('lets an explicit edit move the occurrence anyway', () => {
    // `updateData` spreads AFTER the default, so an edit that genuinely
    // reschedules the occurrence still wins. Editing was never broken and
    // must not become so.
    const moved = new Date('2026-03-20T09:00:00.000Z');
    const override = taskService.buildOverride(master, occurrence, {
      status: 'pending',
      dueDate: moved,
    });

    expect(override.dueDate).toEqual(moved);
    expect(override.originalDueDate).toEqual(occurrence);
  });

  it('is not itself a series master and carries no rule', () => {
    // Otherwise the override would expand occurrences of its own.
    const override = taskService.buildOverride(master, occurrence, { status: 'completed' });
    expect(override.isSeriesMaster).toBe(false);
    expect(override.recurrenceRule).toBeNull();
    expect(override.seriesId).toBe(String(master._id));
  });

  it('is found by the day it was completed on', () => {
    // The user-visible symptom: the daily view for 2026-03-17 requires the
    // row's dueDate to fall inside that UTC day. It used to be 03-15, so the
    // task vanished from the day it was done on.
    const override = taskService.buildOverride(master, occurrence, { status: 'completed' });
    const dayStart = new Date('2026-03-17T00:00:00.000Z');
    const dayEnd = new Date('2026-03-17T23:59:59.999Z');

    expect(override.dueDate >= dayStart && override.dueDate <= dayEnd).toBe(true);
  });
});

describe("the 'all' view no longer expands to the end of time", () => {
  const anchor = new Date('2026-09-20T00:00:00.000Z');
  const endOfDay = new Date('2026-09-20T23:59:59.999Z');

  it('is finite — it used to run to year 275760', () => {
    // Unbounded, one open-ended daily rule expanded to 2,912,443 occurrences
    // in 12.5 seconds on the gateway every app in the suite shares.
    const { viewStart, viewEnd } = taskService.expansionWindow('all', anchor, endOfDay);

    expect(viewStart.getTime()).toBeGreaterThan(new Date('2020-01-01').getTime());
    expect(viewEnd.getTime()).toBeLessThan(new Date('2100-01-01').getTime());
  });

  it('spans a year either side of the anchor day', () => {
    const { viewStart, viewEnd } = taskService.expansionWindow('all', anchor, endOfDay);
    expect(viewStart.toISOString()).toBe('2025-09-20T00:00:00.000Z');
    expect(viewEnd.toISOString()).toBe('2027-09-20T23:59:59.999Z');
  });

  it('caps a daily rule at a number a request can actually serialise', async () => {
    // The real check: expand a real open-ended daily rule over the real
    // window and count what comes back.
    // Default-import + destructure, the interop form this package uses
    // everywhere (see taskService.js:5) — rrule is CJS.
    const rrulePkg = (await import('rrule')).default;
    const { rrulestr } = rrulePkg;
    const { viewStart, viewEnd } = taskService.expansionWindow('all', anchor, endOfDay);
    const rule = rrulestr('DTSTART:20260101T090000Z\nRRULE:FREQ=DAILY');

    const occurrences = rule.between(viewStart, viewEnd, true);
    expect(occurrences.length).toBeLessThan(800);
    expect(occurrences.length).toBeGreaterThan(300);
  });
});

describe('the other views keep their own windows', () => {
  const endOfDay = new Date('2026-09-16T23:59:59.999Z');
  const anchor = new Date('2026-09-16T00:00:00.000Z'); // a Wednesday

  it('daily is the requested day', () => {
    const { viewStart, viewEnd } = taskService.expansionWindow('daily', anchor, endOfDay);
    expect(viewStart).toBe(anchor);
    expect(viewEnd).toBe(endOfDay);
  });

  it('weekly uses the same Monday boundary as the Mongo filter', () => {
    // One definition, two call sites — the duplicate copies are what let the
    // filter and the expansion drift apart at a week edge.
    const { viewStart, viewEnd } = taskService.expansionWindow('weekly', anchor, endOfDay);
    expect(viewStart.toISOString()).toBe('2026-09-14T00:00:00.000Z');
    expect(viewEnd.toISOString()).toBe('2026-09-20T23:59:59.999Z');
  });

  it('monthly is the calendar month', () => {
    const { viewStart, viewEnd } = taskService.expansionWindow('monthly', anchor, endOfDay);
    expect(viewStart.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(viewEnd.toISOString()).toBe('2026-09-30T23:59:59.999Z');
  });
});
