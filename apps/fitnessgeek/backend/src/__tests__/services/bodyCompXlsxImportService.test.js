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

const { default: BodyComposition } = await import('../../models/BodyComposition.js');
const { mapRow, importBodyCompXlsxRows, importBodyCompXlsxUpload, XLSX_SOURCE } =
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
