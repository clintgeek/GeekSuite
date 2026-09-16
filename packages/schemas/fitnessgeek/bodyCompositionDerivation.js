/**
 * fitnessgeek `BodyComposition` — derivation and the arithmetic validation gate.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `bodyComposition.js` stores only what the scale cannot recompute. Everything
 * else a reader wants to see — every percentage, fat-free mass, muscle mass,
 * BMI, BMR, SMI — is arithmetic on those stored primaries, and it is computed
 * here, in one place, for the same reason the field set itself is shared: two
 * independent readers (fitnessgeek's REST backend and basegeek's GraphQL
 * gateway) surface this data, and if they each did their own division the two
 * would eventually disagree about a number the user believes is measured.
 * A schema keeps them from disagreeing about what is stored; this keeps them
 * from disagreeing about what it means.
 *
 * It is CommonJS and dependency-free for the same reasons as its sibling: no
 * build step, requireable and importable by either consumer. It touches no
 * mongoose and no clock, so it is pure and trivially testable.
 *
 * THE VALIDATION GATE
 * -------------------
 * The second half of this file is the part that earns its keep.
 *
 * A body-composition report arrives as a PDF or a photo and is transcribed by
 * a vision model. That transcription is unattended and runs on essentially
 * every weigh-in, so a single misread digit would enter the history silently
 * and quietly poison every trend built on top of it. Nothing downstream can
 * catch it: a plausible-but-wrong 140.2 looks exactly like a right one.
 *
 * Except that it does not, because the report is redundant. It prints both the
 * primaries AND the values derived from them, so recomputing the derived ones
 * and comparing against what was printed re-derives the transcription from a
 * different direction. Every identity below was checked numerically against a
 * real 2026-09-16 scan before being trusted:
 *
 *     fat_free_mass = weight - body_fat_mass        -> 177.0   printed 177
 *     muscle_mass   = fat_free_mass - bone_mass     -> 164.6   printed 164.6
 *     body_fat_%    = body_fat_mass / weight        -> 44.20%  printed 44.2%
 *     body_water_%  = water_kg / weight_kg          -> 41.3%   printed 41.3%
 *     BMR           = 370 + 21.6 * lean_kg          -> 2104    printed 2105
 *     BMI           = weight_kg / height_m^2        -> 44.41   printed 44.4
 *     SMI           = appendicular_kg / height_m^2  -> 11.31   printed 11.3
 *
 * Agreement across that many independent identities is very strong evidence the
 * primaries were read correctly — a misread digit has to break at least one of
 * them, and usually several. Disagreement means a human should look before
 * anything is saved.
 *
 * The gate is worth running even on hand-typed entry, where it catches typos at
 * the point of entry rather than months later in a chart.
 *
 * WHAT THE GATE DELIBERATELY DOES NOT DO
 * --------------------------------------
 * It does not check the report's *comparative* columns ("compared to normal",
 * body type, fitness score, metabolic age). Those are proprietary composites,
 * one of them is demonstrably broken in the vendor's own generator (it prints
 * limb fat at 923.3% of normal), and none of them is reproducible from the
 * primaries. A gate that failed on them would fail on every correct scan.
 */

/** Exact, by definition — the international avoirdupois pound. */
const LB_TO_KG = 0.45359237;

/**
 * Body water is reported in LITRES and compared against a mass. Treating 1 L as
 * 1 kg is the convention the device itself uses (body water is close enough to
 * the density of water that the distinction is far below the report's one
 * decimal place). Named rather than inlined so it is obvious this is an
 * assumption and not an arithmetic identity.
 */
const LITRES_TO_KG = 1;

const lbToKg = (lb) => lb * LB_TO_KG;

/** `null` unless the value is a usable finite number — never `NaN`, never `0/0`. */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Arithmetic that yields `null` the moment any input is missing. */
const sub = (a, b) => (num(a) === null || num(b) === null ? null : a - b);
const pctOf = (part, whole) =>
  num(part) === null || num(whole) === null || whole === 0 ? null : (part / whole) * 100;

/**
 * The four limbs, in the order the report lists them. The trunk is deliberately
 * absent: SMI is an *appendicular* index and including the trunk would roughly
 * double it.
 */
const APPENDICULAR_SEGMENTS = Object.freeze(['left_arm', 'right_arm', 'left_leg', 'right_leg']);
const ALL_SEGMENTS = Object.freeze(['left_arm', 'right_arm', 'trunk', 'left_leg', 'right_leg']);

/** Sum one measure across segments; `null` if any segment is missing it. */
function sumSegments(doc, segments, key) {
  let total = 0;
  for (const name of segments) {
    const v = num(doc?.[name]?.[key]);
    if (v === null) return null;
    total += v;
  }
  return total;
}

/**
 * Everything that is NOT stored, computed from everything that is.
 *
 * Every field is `null` rather than `0` or `NaN` when its inputs are missing —
 * a scan with no `height_cm` has no BMI, and saying so is honest where `0`
 * would be a lie a chart would happily plot.
 *
 * @param {Object} doc - a `BodyComposition` document (or plain object).
 * @returns {Object} derived values; each is a Number or `null`.
 */
function derive(doc) {
  const weightLb = num(doc?.weight_value);
  const weightKg = weightLb === null ? null : lbToKg(weightLb);

  const fatFreeLb = sub(weightLb, num(doc?.body_fat_mass_lb));
  const muscleLb = sub(fatFreeLb, num(doc?.bone_mass_lb));

  // Height is the only input from outside the document's own measurements, and
  // the only reason any derived value here can be `null` while the primaries
  // are complete. See `height_cm`'s comment in bodyComposition.js.
  const heightM = num(doc?.height_cm) === null ? null : doc.height_cm / 100;
  const heightM2 = heightM === null || heightM === 0 ? null : heightM * heightM;

  const appendicularLb = sumSegments(doc, APPENDICULAR_SEGMENTS, 'muscle_lb');

  return {
    fat_free_mass_lb: fatFreeLb,
    muscle_mass_lb: muscleLb,
    appendicular_muscle_lb: appendicularLb,

    body_fat_pct: pctOf(num(doc?.body_fat_mass_lb), weightLb),
    protein_pct: pctOf(num(doc?.protein_lb), weightLb),
    bone_mass_pct: pctOf(num(doc?.bone_mass_lb), weightLb),
    skeletal_muscle_pct: pctOf(num(doc?.skeletal_muscle_lb), weightLb),
    subcutaneous_fat_pct: pctOf(num(doc?.subcutaneous_fat_lb), weightLb),
    muscle_mass_pct: pctOf(muscleLb, weightLb),

    // The one percentage that crosses a unit boundary: litres over kilograms.
    // It still goes through `pctOf` rather than dividing inline, because that
    // is where the zero-denominator guard lives — an inline division here
    // returned `Infinity` on a zero weight while every other percentage
    // correctly returned `null`.
    body_water_pct: pctOf(
      num(doc?.body_water_l) === null ? null : doc.body_water_l * LITRES_TO_KG,
      weightKg,
    ),

    // Katch-McArdle. Verified, not assumed: the device's printed 2105 kcal
    // reproduces to 2104 from lean mass alone, while Mifflin-St Jeor gives
    // 2331. Worth knowing, because it means the report's BMR carries no
    // information the stored fields do not already hold.
    bmr_kcal: fatFreeLb === null ? null : 370 + 21.6 * lbToKg(fatFreeLb),

    bmi: weightKg === null || heightM2 === null ? null : weightKg / heightM2,
    smi: appendicularLb === null || heightM2 === null ? null : lbToKg(appendicularLb) / heightM2,
  };
}

/**
 * How far a recomputation may sit from the printed value before it counts as a
 * mismatch.
 *
 * These are not guesses about model accuracy — they are the rounding error the
 * report itself introduces. Every value on the page is printed to one decimal
 * place, so a recomputation from those rounded inputs can legitimately land up
 * to ~0.1 away, and the bands below are that plus a little air. They are
 * deliberately TIGHT: the gate's whole purpose is catching a misread digit, and
 * a digit error moves a value by far more than these.
 */
const TOLERANCES = Object.freeze({
  mass_lb: 0.15,
  pct: 0.15,
  bmi: 0.2,
  smi: 0.15,
  // BMR is printed as a whole number and its coefficient magnifies rounding in
  // lean mass (21.6 kcal per kg), so its band is proportionally wider.
  bmr_kcal: 15,
});

/**
 * The checks the gate runs, in the order a human would want to read them.
 *
 * `heightDependent` marks the two that need `height_cm`. They are not weaker
 * identities — with the scale's own height stored they reproduce exactly — but
 * they are the only ones that can be skipped for a reason other than a missing
 * measurement, and a caller may want to say so differently in the UI.
 */
const CHECKS = Object.freeze([
  { key: 'fat_free_mass_lb', label: 'Fat-free mass', tolerance: 'mass_lb' },
  { key: 'muscle_mass_lb', label: 'Muscle mass', tolerance: 'mass_lb' },
  { key: 'body_fat_pct', label: 'Body fat %', tolerance: 'pct' },
  { key: 'body_water_pct', label: 'Body water %', tolerance: 'pct' },
  { key: 'protein_pct', label: 'Protein %', tolerance: 'pct' },
  { key: 'bone_mass_pct', label: 'Bone mass %', tolerance: 'pct' },
  { key: 'skeletal_muscle_pct', label: 'Skeletal muscle %', tolerance: 'pct' },
  { key: 'subcutaneous_fat_pct', label: 'Subcutaneous fat %', tolerance: 'pct' },
  { key: 'muscle_mass_pct', label: 'Muscle mass %', tolerance: 'pct' },
  { key: 'bmr_kcal', label: 'BMR', tolerance: 'bmr_kcal' },
  { key: 'bmi', label: 'BMI', tolerance: 'bmi', heightDependent: true },
  { key: 'smi', label: 'SMI', tolerance: 'smi', heightDependent: true },
]);

/**
 * Run the gate.
 *
 * @param {Object} doc     - the extracted `BodyComposition` primaries.
 * @param {Object} printed - the derived values as they appear ON the report,
 *                           keyed the same way `derive()` returns them. Only
 *                           the keys actually present are checked.
 * @returns {{passed: boolean, checked: number, skipped: number,
 *            checks: Array, mismatches: Array}}
 *
 * A check is SKIPPED, not failed, when either side is missing — an extractor
 * that could not read the printed BMR has told us nothing about whether the
 * primaries are right, and treating silence as failure would send every
 * partially-legible scan to manual review.
 *
 * `passed` is true when nothing mismatched. Note that a document where
 * everything was skipped therefore passes vacuously; callers that care should
 * read `checked`, which is why it is returned. A scan whose primaries are all
 * present cannot skip more than the two height-dependent checks.
 */
function validate(doc, printed, { tolerances = TOLERANCES } = {}) {
  const computed = derive(doc);
  const checks = [];

  for (const check of CHECKS) {
    const got = num(computed[check.key]);
    const expected = num(printed?.[check.key]);

    if (got === null || expected === null) {
      checks.push({
        ...check,
        computed: got,
        printed: expected,
        delta: null,
        ok: null,
        skipped: true,
        reason: got === null ? 'not computable from the stored primaries' : 'not read from the report',
      });
      continue;
    }

    const tolerance = tolerances[check.tolerance];
    const delta = got - expected;
    checks.push({
      ...check,
      computed: got,
      printed: expected,
      delta,
      tolerance,
      ok: Math.abs(delta) <= tolerance,
      skipped: false,
    });
  }

  const mismatches = checks.filter((c) => c.ok === false);

  return {
    passed: mismatches.length === 0,
    checked: checks.filter((c) => !c.skipped).length,
    skipped: checks.filter((c) => c.skipped).length,
    checks,
    mismatches,
  };
}

/**
 * A loose consistency note on the segmental figures — NOT a gate criterion.
 *
 * Per-limb values do not sum to the whole-body totals and are not supposed to:
 * on the reference scan the five segments carry 167.2 lb of muscle against a
 * whole-body 164.6, and 136.0 lb of fat against 140.2. The head and neck are
 * not segmented and the segments are independently regressed, so a few percent
 * either way is normal. This exists to catch a segment transcribed into the
 * wrong row or off by an order of magnitude, nothing finer.
 *
 * @returns {{muscle: Object|null, fat: Object|null}} each `{sum, total, driftPct}`.
 */
function segmentalDrift(doc, { warnAtPct = 10 } = {}) {
  const { muscle_mass_lb: muscleTotal } = derive(doc);
  const fatTotal = num(doc?.body_fat_mass_lb);

  const one = (sum, total) => {
    if (sum === null || total === null || total === 0) return null;
    const driftPct = ((sum - total) / total) * 100;
    return { sum, total, driftPct, exceedsWarn: Math.abs(driftPct) > warnAtPct };
  };

  return {
    muscle: one(sumSegments(doc, ALL_SEGMENTS, 'muscle_lb'), muscleTotal),
    fat: one(sumSegments(doc, ALL_SEGMENTS, 'fat_lb'), fatTotal),
  };
}

module.exports = {
  derive,
  validate,
  segmentalDrift,
  TOLERANCES,
  CHECKS,
  APPENDICULAR_SEGMENTS,
  ALL_SEGMENTS,
  LB_TO_KG,
};
module.exports.default = module.exports;
