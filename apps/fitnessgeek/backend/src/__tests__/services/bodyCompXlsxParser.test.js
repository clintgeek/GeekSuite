// bodyCompXlsxParser.test.js — exercised against the REAL committed export,
// `DOCS/body_comp.xlsx`, not a synthetic fixture. That file IS the ground
// truth for this feature (see the task brief and BODY_COMPOSITION_INTAKE.md):
// a hand-built fixture could pass while quietly not matching what Arboleaf's
// exporter actually emits (wrong cell type, a sharedStrings table this
// export doesn't have, …), which is exactly the trap the PDF path fell into
// once already (assumed DCTDecode, failed on the real vendor file — see
// bodyCompXlsxParser.js's own header).

import { describe, test, expect } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { parseBodyCompXlsx } from '../../services/bodyCompXlsxParser.js';

// `process.cwd()` is `apps/fitnessgeek/backend` when this suite runs via its
// own `npm test` — the same cwd-relative convention `bodyCompUploadStorage.js`
// already uses for its own data directory.
const REAL_EXPORT_PATH = path.resolve(process.cwd(), '../../../DOCS/body_comp.xlsx');

describe('parseBodyCompXlsx — against the real Arboleaf export', () => {
  test('parses all 6 scan rows (row 1 is the header, never returned as data)', async () => {
    const buffer = await fs.readFile(REAL_EXPORT_PATH);
    const rows = await parseBodyCompXlsx(buffer);
    expect(rows).toHaveLength(6);
  });

  test('every row is keyed by the export\'s own column headers, verbatim', async () => {
    const buffer = await fs.readFile(REAL_EXPORT_PATH);
    const [row] = await parseBodyCompXlsx(buffer);

    // Spot-check a handful of headers exactly as the real file spells them —
    // including the two that are easy to confuse with each other (see
    // bodyCompXlsxImportService.js's header) and one of the inconsistently
    // worded segmental columns.
    expect(row).toHaveProperty('Measure Time');
    expect(row).toHaveProperty('Weight(lb)');
    expect(row).toHaveProperty('Muscle Mass(lb)'); // the DERIVED figure
    expect(row).toHaveProperty('Skeleton Muscle Mass(lb)'); // the PRIMARY
    expect(row).toHaveProperty('Sinew trunk mass(lb)');
    expect(row).toHaveProperty('left arm body fat mass(lb)');
    expect(row).not.toHaveProperty('Height'); // no height column exists at all
  });

  test('the first row\'s values match what a spreadsheet viewer shows for row 2', async () => {
    const buffer = await fs.readFile(REAL_EXPORT_PATH);
    const [row] = await parseBodyCompXlsx(buffer);

    expect(row['Measure Time']).toBe('09/18/2026 08:09:44');
    expect(row['Weight(lb)']).toBe('321');
    expect(row['Skeleton Muscle Mass(lb)']).toBe('101.8');
    expect(row['Muscle Mass(lb)']).toBe('164.4'); // the derived witness, not a primary
    expect(row['BMI']).toBe('44.9');
  });

  test('a row with a blank cell (the weight-only quick-weigh row) keeps the header but with empty text', async () => {
    const buffer = await fs.readFile(REAL_EXPORT_PATH);
    const rows = await parseBodyCompXlsx(buffer);
    const quickWeigh = rows[5]; // the last row in the real export has no impedance data
    expect(quickWeigh['Weight(lb)']).toBe('316.8');
    expect(quickWeigh['Skeleton Muscle Mass(lb)']).toBe('');
  });

  test('throws a clear error for a buffer that is not a zip at all', async () => {
    await expect(parseBodyCompXlsx(Buffer.from('not a spreadsheet'))).rejects.toThrow();
  });
});
