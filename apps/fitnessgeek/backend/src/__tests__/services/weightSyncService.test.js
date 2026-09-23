// weightSyncService.test.js — the per-day rules of DOCS/BODY_COMPOSITION_INTAKE.md
// §11.5: one Weight per UTC day, the first scan of a day, and THE IMPORT WINS
// over a manual entry.
//
// `Weight` is an in-memory stand-in — this suite has no live database (see
// bodyCompXlsxImportService.test.js's header for the rule). It implements the
// four calls the service makes, with Mongo's semantics for the range query
// and the sort, and nothing else.

const mod = (p) => new URL(p, import.meta.url).pathname;

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { parseBodyCompXlsx } from '../../services/bodyCompXlsxParser.js';

let rows;
let nextId;
let failOn;

jest.unstable_mockModule(mod('../../models/Weight.js'), () => {
  const Weight = jest.fn();
  Weight.find = jest.fn((query) => ({
    sort: async () => {
      const { $gte, $lte } = query.log_date;
      if (failOn && $gte.getTime() === failOn.getTime()) throw new Error('boom');
      return rows
        .filter((r) => r.userId === query.userId && r.log_date >= $gte && r.log_date <= $lte)
        .sort((a, b) => a.created_at - b.created_at)
        .map((r) => ({ ...r }));
    },
  }));
  Weight.create = jest.fn(async (doc) => {
    nextId += 1;
    const row = { notes: '', created_at: new Date(nextId), ...doc, _id: `w${nextId}` };
    rows.push(row);
    return row;
  });
  Weight.updateOne = jest.fn(async ({ _id }, { $set }) => {
    Object.assign(rows.find((r) => r._id === _id), $set);
  });
  Weight.deleteMany = jest.fn(async ({ _id: { $in } }) => {
    rows = rows.filter((r) => !$in.includes(r._id));
  });
  return { __esModule: true, default: Weight };
});

const { syncImportedWeights, firstReadingPerDay, IMPORTED_WEIGHT_SOURCE } =
  await import('../../services/weightSyncService.js');
const { mapRow } = await import('../../services/bodyCompXlsxImportService.js');

const at = (iso) => new Date(iso);
const day = (ymd) => new Date(`${ymd}T00:00:00.000Z`);
const manual = (ymd, weight_value, extra = {}) => {
  nextId += 1;
  const row = {
    _id: `w${nextId}`, userId: 'user-1', weight_value, log_date: day(ymd),
    source: 'manual', notes: '', created_at: new Date(nextId), ...extra,
  };
  rows.push(row);
  return row;
};

beforeEach(() => {
  rows = [];
  nextId = 0;
  failOn = null;
});

describe('firstReadingPerDay', () => {
  test('several scans on one UTC day -> the earliest, whatever order they arrive in', () => {
    const out = firstReadingPerDay([
      { weight_value: 300, measuredAt: at('2026-09-20T20:00:00Z') },
      { weight_value: 302, measuredAt: at('2026-09-20T07:00:00Z') },
      { weight_value: 301, measuredAt: at('2026-09-20T12:00:00Z') },
    ]);
    expect(out).toEqual([{ day: day('2026-09-20'), weight_value: 302 }]);
  });

  test('drops readings with no weight or no valid instant', () => {
    expect(firstReadingPerDay([
      { weight_value: null, measuredAt: at('2026-09-20T07:00:00Z') },
      { weight_value: 300, measuredAt: new Date('nope') },
      { weight_value: 300, measuredAt: null },
    ])).toEqual([]);
  });
});

describe('syncImportedWeights', () => {
  test('an empty day gets a new row at UTC midnight, marked as imported', async () => {
    const summary = await syncImportedWeights([{ weight_value: 317.24, measuredAt: at('2026-09-16T08:01:00Z') }], 'user-1');
    expect(summary).toMatchObject({ created: 1, replaced: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: 'user-1', weight_value: 317.2, log_date: day('2026-09-16'), source: IMPORTED_WEIGHT_SOURCE,
    });
  });

  test('THE IMPORT WINS: a manual weight on the same day is overwritten, its notes kept', async () => {
    manual('2026-09-16', 320, { notes: 'after dinner' });
    const summary = await syncImportedWeights([{ weight_value: 317.2, measuredAt: at('2026-09-16T08:01:00Z') }], 'user-1');
    expect(summary).toMatchObject({ created: 0, replaced: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ weight_value: 317.2, source: IMPORTED_WEIGHT_SOURCE, notes: 'after dinner' });
  });

  test('surplus rows for the same day are removed, leaving exactly one', async () => {
    manual('2026-09-16', 320);
    manual('2026-09-16', 321);
    const summary = await syncImportedWeights([{ weight_value: 317.2, measuredAt: at('2026-09-16T08:01:00Z') }], 'user-1');
    expect(summary).toMatchObject({ replaced: 1, removed: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0].weight_value).toBe(317.2);
  });

  test('re-syncing the same history changes nothing', async () => {
    const readings = [{ weight_value: 317.2, measuredAt: at('2026-09-16T08:01:00Z') }];
    await syncImportedWeights(readings, 'user-1');
    const again = await syncImportedWeights(readings, 'user-1');
    expect(again).toMatchObject({ created: 0, replaced: 0, unchanged: 1, removed: 0 });
    expect(rows).toHaveLength(1);
  });

  test('another user\'s weight on the same day is left alone', async () => {
    manual('2026-09-16', 200, { userId: 'user-2' });
    await syncImportedWeights([{ weight_value: 317.2, measuredAt: at('2026-09-16T08:01:00Z') }], 'user-1');
    expect(rows.find((r) => r.userId === 'user-2')).toMatchObject({ weight_value: 200, source: 'manual' });
  });

  test('a manual weight on a day with NO scan is untouched', async () => {
    manual('2026-09-15', 320);
    await syncImportedWeights([{ weight_value: 317.2, measuredAt: at('2026-09-16T08:01:00Z') }], 'user-1');
    expect(rows.find((r) => r.log_date.getTime() === day('2026-09-15').getTime()))
      .toMatchObject({ weight_value: 320, source: 'manual' });
  });

  test('one failing day is counted and the rest of the history still syncs', async () => {
    failOn = day('2026-09-15');
    const summary = await syncImportedWeights([
      { weight_value: 318, measuredAt: at('2026-09-15T08:00:00Z') },
      { weight_value: 317, measuredAt: at('2026-09-16T08:00:00Z') },
    ], 'user-1');
    expect(summary).toMatchObject({ created: 1, failed: 1 });
    expect(rows.map((r) => r.log_date)).toEqual([day('2026-09-16')]);
  });

  test('the real export: one weight per scan day, each the day\'s first scan', async () => {
    const buffer = await fs.readFile(path.resolve(process.cwd(), '../../../DOCS/body_comp.xlsx'));
    const readings = (await parseBodyCompXlsx(buffer))
      .map(mapRow)
      .map(({ candidate, measuredAt }) => ({ weight_value: candidate.weight_value, measuredAt }));
    const expected = firstReadingPerDay(readings);

    const summary = await syncImportedWeights(readings, 'user-1');
    expect(summary.created).toBe(expected.length);
    expect(rows.map((r) => [r.log_date.toISOString(), r.weight_value]))
      .toEqual(expected.map((e) => [e.day.toISOString(), Math.round(e.weight_value * 10) / 10]));
  });
});
