// bodyCompXlsxImportService — turn a parsed Arboleaf ".xlsx" export into
// saved `BodyComposition` rows.
//
// This is the mapping+gate+persistence half of the spreadsheet import path;
// `bodyCompXlsxParser.js` is the read-the-file half. Splitting them keeps the
// column mapping below testable against plain objects (see this module's
// tests, which run it directly against rows read from the REAL committed
// `DOCS/body_comp.xlsx`) without needing Mongo or a zip in the same test.
//
// WHY A COLUMN MAP AND NOT A HEADER-NAME NORMALIZER
// ----------------------------------------------------
// It would be tempting to lower-case and strip punctuation from every header
// and match loosely. Do not do this. The export's own headers are
// inconsistent ON PURPOSE by the vendor, not by accident — "Right Arm Muscle
// Rate(%)" next to "Left arm muscle ratio(%)", "Sinew trunk mass(lb)" next to
// "left leg muscle mass(lb)" with no capitalization pattern at all — and two
// pairs of columns are one keystroke apart from being silently swapped:
//
//   - "Muscle Mass(lb)" (a DERIVED value: fat-free mass minus bone mass) is
//     NOT the same column as "Skeleton Muscle Mass(lb)" (the directly
//     measured primary this schema calls `skeletal_muscle_lb`). A normalizer
//     that folded "Muscle Mass" and "Skeleton Muscle Mass" toward the same
//     key would reintroduce the exact bug DOCS/BODY_COMPOSITION_INTAKE.md
//     documents the vision path having shipped once already (see
//     bodyCompExtractionService.js's header, point 3).
//   - Every column ending "(%)" is a derived percentage and must never be
//     read into a stored primary, however similar its name looks to one.
//
// The map below is therefore keyed by the EXACT header string as the real
// export file spells it, checked cell-for-cell against `DOCS/body_comp.xlsx`
// (see this module's test suite) rather than assumed from a schema the
// vendor happens to publish elsewhere.
//
// WHAT GETS STORED VS. WHAT'S THE GATE'S WITNESS
// ---------------------------------------------------
// Same split as the vision path (BODY_COMPOSITION_INTAKE.md §5/§10.1): the
// eight whole-body + ten segmental PRIMARIES go into `PRIMARY_COLUMNS`/
// `SEGMENT_COLUMNS` below and become the saved document; the derived
// columns the export ALSO prints ("BMI", "Muscle Mass(lb)", "SMI", every
// "(%)" column) go into `PRINTED_COLUMNS` and are never stored — they exist
// only so `validate()` (@geeksuite/schemas/fitnessgeek/bodyCompositionDerivation)
// can recompute them from the primaries and confirm the mapping read the
// right cells. A row that fails the gate is refused, not "saved anyway" —
// see `importBodyCompXlsxRows` below.

import { toUtcMidnight } from '@geeksuite/utils';
import { validate, LB_TO_KG } from '@geeksuite/schemas/fitnessgeek/bodyCompositionDerivation';
import BodyComposition from '../models/BodyComposition.js';
import logger from '../config/logger.js';
import { parseBodyCompXlsx } from './bodyCompXlsxParser.js';
import { syncImportedWeights } from './weightSyncService.js';

/** The `source` value for a row that came in through this path — see bodyComposition.js's enum comment. */
export const XLSX_SOURCE = 'arboleaf_xlsx';

/**
 * Whole-body primaries: export header -> stored field. Values that need a
 * unit conversion (body water) are handled specially in `mapRow`, below —
 * this map only covers the columns that go straight across.
 */
const PRIMARY_COLUMNS = Object.freeze({
  'Weight(lb)': 'weight_value',
  'Body Fat Mass(lb)': 'body_fat_mass_lb',
  'Protein Mass(lb)': 'protein_lb',
  'Bone Mass(lb)': 'bone_mass_lb',
  // NOT "Muscle Mass(lb)" — that column is the DERIVED fat-free-mass-minus-
  // bone-mass figure (goes to PRINTED_COLUMNS below). This is the row
  // literally labelled "Skeleton Muscle Mass", the directly-measured value.
  'Skeleton Muscle Mass(lb)': 'skeletal_muscle_lb',
  'Subcutaneous Fat(lb)': 'subcutaneous_fat_lb',
  'Visceral Fat': 'visceral_fat_index',
});

/**
 * Segmental primaries: export header -> [segment name, leaf key]. "Sinew"
 * is the vendor's word for muscle throughout this file (e.g. "Sinew trunk
 * mass(lb)"); "Sinew trunk ratio(%)" is its percentage sibling and is
 * correctly excluded — it belongs nowhere, not even in `PRINTED_COLUMNS`,
 * since the gate has no check that consumes it.
 */
const SEGMENT_COLUMNS = Object.freeze({
  'Left arm muscle mass(lb)': ['left_arm', 'muscle_lb'],
  'left arm body fat mass(lb)': ['left_arm', 'fat_lb'],
  'Right arm muscle mass(lb)': ['right_arm', 'muscle_lb'],
  'Body fat mass in right arm(lb)': ['right_arm', 'fat_lb'],
  'Sinew trunk mass(lb)': ['trunk', 'muscle_lb'],
  'Trunk body fat mass(lb)': ['trunk', 'fat_lb'],
  'left leg muscle mass(lb)': ['left_leg', 'muscle_lb'],
  'Left leg body fat mass(lb)': ['left_leg', 'fat_lb'],
  'Right leg muscle mass(lb)': ['right_leg', 'muscle_lb'],
  'body fat mass in right leg(lb)': ['right_leg', 'fat_lb'],
});

/**
 * The gate's witness values: export header -> `printed.<key>` as
 * `validate()` expects it (see `derive()` in bodyCompositionDerivation.js for
 * the same key names). None of these are stored on the document.
 */
const PRINTED_COLUMNS = Object.freeze({
  'Fat-free Body Weight(lb)': 'fat_free_mass_lb',
  'Muscle Mass(lb)': 'muscle_mass_lb',
  'Body Fat(%)': 'body_fat_pct',
  'Body Water(%)': 'body_water_pct',
  'Protein(%)': 'protein_pct',
  'Bone Mass Percentage(%)': 'bone_mass_pct',
  'Skeletal Muscle(%)': 'skeletal_muscle_pct',
  'Subcutaneous Fat Percentage(%)': 'subcutaneous_fat_pct',
  'Muscle Mass Percentage(%)': 'muscle_mass_pct',
  'BMR(kcal)': 'bmr_kcal',
  BMI: 'bmi',
  SMI: 'smi',
});

/** The export's own timestamp column, "MM/DD/YYYY HH:mm:ss" — e.g. "09/18/2026 08:09:44". */
const MEASURE_TIME_COLUMN = 'Measure Time';
const MEASURE_TIME_RE = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/;

/**
 * A cell's text as a finite number, or `null`. Every value in this export is
 * plain text at the XML layer (see bodyCompXlsxParser.js's header) — this is
 * the one place that turns it into a number, so a blank cell or a stray
 * non-numeric value (the export has been seen to leave a cell empty rather
 * than write "0") becomes an honest `null` rather than `NaN` or a
 * silently-wrong `0`.
 */
function numOrNull(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(String(raw).trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse "MM/DD/YYYY HH:mm:ss" into an instant.
 *
 * THE TIMEZONE ASSUMPTION, STATED OUT LOUD: the export carries no timezone
 * indicator at all — no offset, no "Z", nothing to say whether 08:09:44 was
 * local to the phone or already normalized. Rather than guess by reading
 * the SERVER's timezone (`new Date('09/18/2026 08:09:44')` parses as
 * whatever zone the Node process happens to be running in, which would make
 * the exact same file import to a DIFFERENT instant depending on where this
 * code runs — dev laptop vs. container vs. CI), this treats the printed
 * wall-clock numbers as already being the UTC instant. That is a real
 * assumption, not a discovered fact, and it is deterministic and
 * reproducible either way: the same file always imports to the same
 * `measured_at`/`log_date` regardless of server timezone, which is what
 * dedupe (§7) and repeat imports depend on. If Arboleaf's export format ever
 * documents its actual timezone convention, fix it here — this is the one
 * function that would need to change.
 *
 * @param {string} raw
 * @returns {Date|null} `null` if the text doesn't match the expected shape.
 */
function parseMeasureTime(raw) {
  const match = MEASURE_TIME_RE.exec(String(raw ?? '').trim());
  if (!match) return null;
  const [, month, day, year, hour, minute, second] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Recover height from the export's own BMI column — the export has no
 * height column at all (BMI and weight are printed; height is the input
 * that produced BMI, so it can be run backward): `height_m = sqrt(weight_kg
 * / BMI)`.
 *
 * Verified against the real file's first row: 321 lb / BMI 44.9 recovers to
 * 180.1 cm, matching the height independently derived from a PDF export of
 * the same person's data (BODY_COMPOSITION_INTAKE.md §10.3 — 180 cm).
 *
 * `null` on a missing or zero BMI rather than throwing or dividing by zero —
 * matching every other optional field's convention in this module: an
 * absent input produces an absent (and gate-skipped, per `validate()`'s own
 * skip-not-fail rule) height, not a crash on an otherwise-good row.
 *
 * @param {number|null} weightLb
 * @param {number|null} bmi
 * @returns {number|null} centimetres, rounded to one decimal place (the
 *   export's own precision for every other measurement).
 */
function recoverHeightCm(weightLb, bmi) {
  if (weightLb === null || bmi === null || bmi <= 0) return null;
  const weightKg = weightLb * LB_TO_KG;
  const heightM = Math.sqrt(weightKg / bmi);
  if (!Number.isFinite(heightM) || heightM <= 0) return null;
  return Math.round(heightM * 1000) / 10;
}

/**
 * Map one parsed export row (as `bodyCompXlsxParser.js` returns it — a plain
 * `{ "Column Header": "cell text" }` object) onto the candidate primaries,
 * the gate's printed witnesses, and the parsed instant.
 *
 * Exported for direct testing against real rows without needing to
 * round-trip through the zip/XML layer for every case.
 *
 * @param {Record<string, string>} row
 * @returns {{candidate: object, printed: object, measuredAt: Date|null}}
 */
export function mapRow(row) {
  const candidate = {};
  for (const [header, field] of Object.entries(PRIMARY_COLUMNS)) {
    candidate[field] = numOrNull(row[header]);
  }
  for (const [header, [segment, key]] of Object.entries(SEGMENT_COLUMNS)) {
    candidate[segment] = candidate[segment] || {};
    candidate[segment][key] = numOrNull(row[header]);
  }
  // Ensure every segment object exists (even if a column were missing) so
  // downstream code can rely on `candidate.left_arm.muscle_lb` etc. without
  // an optional-chain at every call site.
  for (const segment of ['left_arm', 'right_arm', 'trunk', 'left_leg', 'right_leg']) {
    candidate[segment] = candidate[segment] || { muscle_lb: null, fat_lb: null };
  }

  const printed = {};
  for (const [header, key] of Object.entries(PRINTED_COLUMNS)) {
    printed[key] = numOrNull(row[header]);
  }

  // Body water is the one primary that needs a unit conversion: the export
  // prints it in lb ("Body Water Mass(lb)"), but the schema stores LITRES —
  // see bodyComposition.js's header on why. 1 lb of water is 1 lb / 2.2046
  // kg, and 1 kg of water is (to the precision this report cares about) 1 L
  // — the same LITRES_TO_KG≈1 convention `derive()` itself documents.
  const bodyWaterLb = numOrNull(row['Body Water Mass(lb)']);
  candidate.body_water_l = bodyWaterLb === null ? null : bodyWaterLb * LB_TO_KG;

  candidate.height_cm = recoverHeightCm(candidate.weight_value, printed.bmi);

  const measuredAt = parseMeasureTime(row[MEASURE_TIME_COLUMN]);

  return { candidate, printed, measuredAt };
}

/**
 * Import every row of an already-parsed export for one user, running the
 * arithmetic gate on each and saving only what passes.
 *
 * A single call handles a WHOLE history file (§7 of
 * BODY_COMPOSITION_INTAKE.md: "a single file carries the user's whole
 * history"), so this never throws for a per-row problem — a bad row, a
 * duplicate, or a save error all become a counted, reported outcome, and the
 * rest of the file keeps importing. It throws only if the rows themselves
 * cannot be iterated (a totally malformed input) — the caller is expected to
 * have already produced `rows` via `parseBodyCompXlsx`, which is what
 * legitimately throws for "this isn't a workbook at all."
 *
 * @param {Array<Record<string, string>>} rows - as returned by `parseBodyCompXlsx`.
 * @param {string} userId
 * @returns {Promise<{imported: number, skipped: number, failed: number, results: Array, weights: Object|null}>}
 *   `weights` is `syncImportedWeights`'s summary (§11.5), or null if the
 *   sync itself blew up — the body-comp rows are saved either way.
 *   `results` carries one entry per row (1-indexed against the data rows,
 *   i.e. row 1 is the first SCAN row, not the header) for a caller that
 *   wants to say which rows had trouble, not just how many.
 */
export async function importBodyCompXlsxRows(rows, userId) {
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const results = [];
  // Scale readings for the `Weight` sync — every row that passed the gate and
  // is in the database, INCLUDING duplicates: scans imported before weights
  // were synced would otherwise never reach the weight history (§11.5).
  const verifiedReadings = [];

  for (let i = 0; i < rows.length; i += 1) {
    const rowNumber = i + 1;
    const { candidate, printed, measuredAt } = mapRow(rows[i]);

    // Same vacuous-pass trap the vision path guards against (§10.5): a row
    // where every check was skipped satisfies `validation.passed` by having
    // nothing to disagree with. `checked > 0` is what turns "verified" and
    // "nothing was checked" into two different, distinguishable outcomes.
    const validation = validate(candidate, printed);
    const verifiedClean = validation.passed && validation.checked > 0;

    if (!verifiedClean) {
      failed += 1;
      logger.warn(
        { userId, row: rowNumber, checked: validation.checked, mismatches: validation.mismatches.length },
        'body-comp xlsx import: row failed the arithmetic gate, not saving',
      );
      results.push({ row: rowNumber, status: 'failed', reason: 'gate_mismatch', validation });
      continue;
    }

    if (candidate.weight_value == null || !measuredAt) {
      // Verified on everything it COULD check, but one of the two fields the
      // schema itself requires never read cleanly — mirrors the vision
      // path's "incomplete" outcome (bodyCompExtractController.js).
      failed += 1;
      logger.warn({ userId, row: rowNumber }, 'body-comp xlsx import: row missing weight or a parseable timestamp, not saving');
      results.push({ row: rowNumber, status: 'failed', reason: 'incomplete' });
      continue;
    }

    try {
      const saved = await BodyComposition.create({
        userId,
        ...candidate,
        measured_at: measuredAt,
        // THE UTC DATE SEPARATION PRINCIPLE (THE_CONTEXT.md §3.1) — same
        // rule as the vision path's `saveBodyComposition`
        // (bodyCompExtractController.js): `log_date` is the UTC calendar day
        // this scan counts for, computed FROM the instant, never defaulted.
        log_date: toUtcMidnight(measuredAt),
        source: XLSX_SOURCE,
        extraction: { validation_passed: true, confidence: null, method: 'xlsxImport' },
      });
      imported += 1;
      verifiedReadings.push({ weight_value: candidate.weight_value, measuredAt });
      results.push({ row: rowNumber, status: 'imported', id: saved._id?.toString?.() });
    } catch (error) {
      if (error?.code === 11000) {
        // The `(userId, measured_at)` unique index — this exact scan was
        // already imported (a re-share of the same export, or overlapping
        // history from two exports). Expected traffic, not a fault — see §7.
        skipped += 1;
        verifiedReadings.push({ weight_value: candidate.weight_value, measuredAt });
        results.push({ row: rowNumber, status: 'skipped', reason: 'duplicate' });
      } else {
        failed += 1;
        logger.error({ err: error, userId, row: rowNumber }, 'body-comp xlsx import: failed to save a verified row');
        results.push({ row: rowNumber, status: 'failed', reason: 'save_error' });
      }
    }
  }

  let weights = null;
  try {
    weights = await syncImportedWeights(verifiedReadings, userId);
  } catch (error) {
    logger.error({ err: error, userId }, 'body-comp xlsx import: weight sync failed; body-comp rows are saved');
  }

  return { imported, skipped, failed, results, weights };
}

/**
 * The whole path in one call: parse the uploaded bytes, then import every
 * row. What `bodyCompImportController.js` actually calls.
 *
 * @param {{buffer: Buffer, userId: string}} params
 * @returns {Promise<{imported: number, skipped: number, failed: number, results: Array, weights: Object|null}>}
 */
export async function importBodyCompXlsxUpload({ buffer, userId }) {
  const rows = await parseBodyCompXlsx(buffer);
  return importBodyCompXlsxRows(rows, userId);
}

export default { importBodyCompXlsxUpload, importBodyCompXlsxRows, mapRow, XLSX_SOURCE };
