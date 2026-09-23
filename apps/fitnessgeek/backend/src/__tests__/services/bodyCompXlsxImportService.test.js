// bodyCompXlsxImportService.test.js — mapping, the arithmetic gate, and bulk
// import/dedupe, all run against the REAL committed export
// (`DOCS/body_comp.xlsx`), per this task's own verification rule: a
// synthetic fixture could pass while the real vendor file still fails, which
// is precisely how the vision path's Skeletal-Muscle/Muscle-Mass mixup
// shipped once already (see bodyCompExtractionService.js's header).
//
// `BodyComposition` is mocked rather than hitting a real Mongo — this suite
// has no live database and mongodb-memory-server has always been refused
// here (see jest.setup.js and garminPasswordEncryption.test.js's header for
// the same rule applied elsewhere in this suite). The mock below reproduces
// the ONE piece of Mongo behavior this module actually depends on — the
// `(userId, measured_at)` unique index throwing a `code: 11000` error on a
// duplicate — with a plain in-memory `Set`, which is enough to prove the
// dedupe logic (not Mongo's index implementation, which is not this
// repo's code to test).

const mod = (p) => new URL(p, import.meta.url).pathname;

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { validate } from '@geeksuite/schemas/fitnessgeek/bodyCompositionDerivation';
import { parseBodyCompXlsx } from '../../services/bodyCompXlsxParser.js';

// A minimal stand-in for Mongo's own unique-index enforcement — see the
// header. `seenKeys` persists across calls within one test (that's the point:
// "import the same file twice" needs the second call to see the first
// call's writes), and is cleared in `beforeEach` so tests don't leak into
// each other.
let seenKeys;
let nextId;

jest.unstable_mockModule(mod('../../models/BodyComposition.js'), () => {
  const BodyComposition = jest.fn();
  BodyComposition.create = jest.fn(async (doc) => {
    const key = `${doc.userId}|${new Date(doc.measured_at).toISOString()}`;
    if (seenKeys.has(key)) {
      const error = new Error('E11000 duplicate key error — (userId, measured_at)');
      error.code = 11000;
      throw error;
    }
    seenKeys.add(key);
    nextId += 1;
    return { ...doc, _id: { toString: () => `mock-id-${nextId}` } };
  });
  return { __esModule: true, default: BodyComposition };
});

// The Weight sync has its own suite (weightSyncService.test.js); here it is
// mocked at the boundary so these tests stay about body-comp rows — and so
// they can assert WHICH readings the import hands it.
const WEIGHT_SUMMARY = { created: 0, replaced: 0, unchanged: 0, removed: 0, failed: 0 };
jest.unstable_mockModule(mod('../../services/weightSyncService.js'), () => ({
  __esModule: true,
  syncImportedWeights: jest.fn(async () => WEIGHT_SUMMARY),
  default: {},
}));

const { default: BodyComposition } = await import('../../models/BodyComposition.js');
const { syncImportedWeights } = await import('../../services/weightSyncService.js');
const { mapRow, importBodyCompXlsxRows, importBodyCompXlsxUpload, XLSX_SOURCE, XLSX_TOLERANCES } =
  await import('../../services/bodyCompXlsxImportService.js');

const REAL_EXPORT_PATH = path.resolve(process.cwd(), '../../../DOCS/body_comp.xlsx');

async function readRealRows() {
  const buffer = await fs.readFile(REAL_EXPORT_PATH);
  return parseBodyCompXlsx(buffer);
}

beforeEach(() => {
  seenKeys = new Set();
  nextId = 0;
  BodyComposition.create.mockClear();
  syncImportedWeights.mockClear();
});

describe('mapRow — the trap this task exists to avoid', () => {
  test('row 1: skeletal_muscle_lb is the SKELETON MUSCLE column (~101.8), never the derived MUSCLE MASS column (~164.4)', async () => {
    const [row] = await readRealRows();
    const { candidate, printed } = mapRow(row);

    expect(candidate.skeletal_muscle_lb).toBeCloseTo(101.8, 5);
    expect(candidate.skeletal_muscle_lb).not.toBeCloseTo(164.4, 0);
    // The 164.4 figure is real, but it belongs in `printed`, never `candidate`.
    expect(printed.muscle_mass_lb).toBeCloseTo(164.4, 5);
  });

  test('row 1: body water converts lb -> litres, and derive().body_water_lb reproduces the export\'s own lb column', async () => {
    const { derive } = await import('@geeksuite/schemas/fitnessgeek/bodyCompositionDerivation');
    const [row] = await readRealRows();
    const { candidate } = mapRow(row);

    // The export prints 130.6 lb; the schema stores litres.
    expect(candidate.body_water_l).toBeCloseTo(59.24, 1);
    // And round-tripping through the shared `derive()` gets back to the
    // export's own lb figure — the whole point of storing litres per
    // bodyComposition.js's header.
    expect(derive(candidate).body_water_lb).toBeCloseTo(130.6, 1);
  });

  test('row 1: height recovers from BMI to ~180 cm (no height column exists in the export at all)', async () => {
    const [row] = await readRealRows();
    const { candidate } = mapRow(row);
    expect(candidate.height_cm).toBeGreaterThan(179);
    expect(candidate.height_cm).toBeLessThan(181);
  });

  test('measured_at parses the export\'s "MM/DD/YYYY HH:mm:ss" column into a real Date', async () => {
    const [row] = await readRealRows();
    const { measuredAt } = mapRow(row);
    expect(measuredAt).toBeInstanceOf(Date);
    expect(Number.isNaN(measuredAt.getTime())).toBe(false);
  });
});

describe('the arithmetic gate, run on every real row', () => {
  test('all 6 rows verify clean — 0 mismatches each', async () => {
    const rows = await readRealRows();
    expect(rows).toHaveLength(6);

    for (const [i, row] of rows.entries()) {
      const { candidate, printed } = mapRow(row);
      const validation = validate(candidate, printed);
      expect(validation.mismatches).toHaveLength(0);
      // Every row is at least "verified clean," per the vacuous-pass rule —
      // `checked > 0` is what tells a genuinely-checked row apart from one
      // where nothing could be compared (see bodyCompXlsxImportService.js's
      // header on why `passed` alone isn't enough).
      expect(validation.checked).toBeGreaterThan(0);
      expect(validation.passed).toBe(true);
      if (validation.checked < 12) {
        // Only the weight-only "quick weigh" row (no impedance data) should
        // ever check fewer than all 12 — everything else in the real file
        // has a full primary set and should run every check.
        expect(i).toBe(5);
      }
    }
  });

  test('the full-scan rows (not the weight-only one) check all 12 identities', async () => {
    const rows = await readRealRows();
    const { candidate, printed } = mapRow(rows[0]);
    const validation = validate(candidate, printed);
    expect(validation.checked).toBe(12);
    expect(validation.skipped).toBe(0);
  });
});

describe('importBodyCompXlsxRows — bulk import and dedupe', () => {
  test('importing the real file once saves all 6 rows', async () => {
    const rows = await readRealRows();
    const result = await importBodyCompXlsxRows(rows, 'user-1');

    expect(result.imported).toBe(6);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(BodyComposition.create).toHaveBeenCalledTimes(6);
  });

  test('every saved row carries the xlsx source and passed-gate provenance', async () => {
    const rows = await readRealRows();
    await importBodyCompXlsxRows(rows, 'user-1');

    const firstCallDoc = BodyComposition.create.mock.calls[0][0];
    expect(firstCallDoc.source).toBe(XLSX_SOURCE);
    expect(firstCallDoc.extraction.validation_passed).toBe(true);
    expect(firstCallDoc.userId).toBe('user-1');
    // `log_date` must be UTC midnight of `measured_at`'s day — the two-dates
    // rule (THE_CONTEXT.md §3.1) this whole schema is built around.
    expect(firstCallDoc.log_date.getUTCHours()).toBe(0);
    expect(firstCallDoc.log_date.getUTCMinutes()).toBe(0);
  });

  test('importing the SAME file a second time imports 0 and skips all 6', async () => {
    const rows = await readRealRows();

    const first = await importBodyCompXlsxRows(rows, 'user-1');
    expect(first.imported).toBe(6);

    const second = await importBodyCompXlsxRows(rows, 'user-1');
    expect(second.imported).toBe(0);
    expect(second.skipped).toBe(6);
    expect(second.failed).toBe(0);
  });

  test('two different users importing the same file both get their own 6 rows (dedupe is per-user)', async () => {
    const rows = await readRealRows();

    const forUserOne = await importBodyCompXlsxRows(rows, 'user-1');
    const forUserTwo = await importBodyCompXlsxRows(rows, 'user-2');

    expect(forUserOne.imported).toBe(6);
    expect(forUserTwo.imported).toBe(6);
  });

  test('a row that fails the gate is not saved, and is reported as failed rather than thrown', async () => {
    const rows = await readRealRows();
    // Corrupt one row's primary so it can no longer reproduce the printed
    // witnesses — simulating exactly the failure mode this whole gate exists
    // to catch (a misread/mis-mapped column).
    const brokenRows = [...rows];
    brokenRows[0] = { ...rows[0], 'Bone Mass(lb)': '999' };

    const result = await importBodyCompXlsxRows(brokenRows, 'user-1');
    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(result.imported).toBe(5);
    expect(result.results[0].status).toBe('failed');
  });

  test('importBodyCompXlsxUpload runs the whole pipeline from raw bytes', async () => {
    const buffer = await fs.readFile(REAL_EXPORT_PATH);
    const result = await importBodyCompXlsxUpload({ buffer, userId: 'user-1' });
    expect(result.imported).toBe(6);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
  });
});

describe('importBodyCompXlsxRows — feeding the Weight sync (§11.5)', () => {
  test('every verified row reaches the sync, with its weight and instant', async () => {
    const rows = await readRealRows();
    const result = await importBodyCompXlsxRows(rows, 'user-1');

    expect(syncImportedWeights).toHaveBeenCalledTimes(1);
    const [readings, userId] = syncImportedWeights.mock.calls[0];
    expect(userId).toBe('user-1');
    expect(readings).toHaveLength(6);
    for (const r of readings) {
      expect(Number.isFinite(r.weight_value)).toBe(true);
      expect(r.measuredAt).toBeInstanceOf(Date);
    }
    expect(result.weights).toBe(WEIGHT_SUMMARY);
  });

  test('rows skipped as duplicates STILL reach the sync — they predate weight syncing', async () => {
    const rows = await readRealRows();
    await importBodyCompXlsxRows(rows, 'user-1');
    syncImportedWeights.mockClear();

    const second = await importBodyCompXlsxRows(rows, 'user-1');
    expect(second.skipped).toBe(6);
    expect(syncImportedWeights.mock.calls[0][0]).toHaveLength(6);
  });

  test('a row that fails the gate does NOT reach the sync', async () => {
    const rows = await readRealRows();
    const brokenRows = [...rows];
    brokenRows[0] = { ...rows[0], 'Bone Mass(lb)': '999' };

    await importBodyCompXlsxRows(brokenRows, 'user-1');
    const readings = syncImportedWeights.mock.calls[0][0];
    expect(readings).toHaveLength(5);
    const { measuredAt: brokenInstant } = mapRow(rows[0]);
    expect(readings.some((r) => r.measuredAt.getTime() === brokenInstant.getTime())).toBe(false);
  });

  test('a sync that throws leaves the body-comp result intact, with weights null', async () => {
    syncImportedWeights.mockImplementationOnce(async () => { throw new Error('mongo down'); });
    const rows = await readRealRows();
    const result = await importBodyCompXlsxRows(rows, 'user-1');
    expect(result.imported).toBe(6);
    expect(result.weights).toBeNull();
  });
});

describe('the xlsx gate band (§11.6) — the scale\'s own rounding passes, a mis-mapping does not', () => {
  // Reproduce the real 2026-09-19 09:42 scan's drift on a committed row: the
  // printed fat-free mass 0.2 lb under the recomputation and muscle mass 0.2
  // over, exactly the disagreement the scale's own columns showed.
  async function driftedRow() {
    const rows = await readRealRows();
    const { candidate } = mapRow(rows[0]);
    const ffm = candidate.weight_value - candidate.body_fat_mass_lb;
    const muscle = ffm - candidate.bone_mass_lb;
    return {
      ...rows[0],
      'Fat-free Body Weight(lb)': (ffm - 0.2).toFixed(1),
      'Muscle Mass(lb)': (muscle + 0.2).toFixed(1),
    };
  }

  test('the default band rejects the drift — which is why this path needs its own', async () => {
    const { candidate, printed } = mapRow(await driftedRow());
    expect(validate(candidate, printed).passed).toBe(false);
  });

  test('the xlsx band accepts it, and the import saves the row', async () => {
    const row = await driftedRow();
    const { candidate, printed } = mapRow(row);
    expect(validate(candidate, printed, { tolerances: XLSX_TOLERANCES }).passed).toBe(true);
    const result = await importBodyCompXlsxRows([row], 'user-1');
    expect(result.imported).toBe(1);
  });

  test('a transposed Muscle Mass / Skeletal Muscle column still fails under the xlsx band', async () => {
    const rows = await readRealRows();
    const swapped = {
      ...rows[0],
      'Muscle Mass(lb)': rows[0]['Skeleton Muscle Mass(lb)'],
      'Skeleton Muscle Mass(lb)': rows[0]['Muscle Mass(lb)'],
    };
    const result = await importBodyCompXlsxRows([swapped], 'user-1');
    expect(result.imported).toBe(0);
    expect(result.results[0]).toMatchObject({ status: 'failed', reason: 'gate_mismatch' });
  });
});

describe('mapRow — the device (kept, not a measurement)', () => {
  test('full scans name the scale; the weight-only quick weigh carries no device and maps to nulls', async () => {
    const rows = await readRealRows();
    const mapped = rows.map((row) => mapRow(row).candidate.device);
    const named = mapped.filter((d) => d.name);
    // The committed export: five full scans on a CS10K, one quick weigh with
    // the device columns left blank.
    expect(named).toHaveLength(5);
    for (const d of named) {
      expect(d.name).toBe('CS10K');
      expect(d.mac).toMatch(/^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/);
    }
    expect(mapped.filter((d) => !d.name)).toEqual([{ name: null, mac: null }]);
  });

  test('a row without device columns maps to nulls, not empty strings', async () => {
    const rows = await readRealRows();
    const { 'Device Name': _n, 'Device MAC Address': _m, ...bare } = rows[0];
    expect(mapRow(bare).candidate.device).toEqual({ name: null, mac: null });
  });
});

