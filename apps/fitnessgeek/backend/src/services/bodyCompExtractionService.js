// bodyCompExtractionService — turn a stored body-composition upload into a
// candidate `BodyComposition` document, using a vision model as a
// transcriber and the arithmetic gate as the check on its work.
//
// See DOCS/BODY_COMPOSITION_INTAKE.md §10 ("the extraction contract") before
// changing anything in here. Two rules from it are load-bearing and easy to
// break by accident while "improving" the prompt:
//
//   1. THE MODEL EXTRACTS, IT NEVER COMPUTES (§10.1). It returns the stored
//      primaries/segments AND the derived values exactly as printed on the
//      report — two independent transcriptions of two different things the
//      report shows. If the model computed the derived column itself
//      instead of reading it, its answer would agree with our own
//      recomputation BY CONSTRUCTION, and `validate()` (§6) would verify
//      nothing at all. The two groups must come from two different places on
//      the page, never from arithmetic on each other.
//
//   2. A VALUE IT CANNOT READ COMES BACK `null`, NEVER GUESSED (§10.2). This
//      is why every field pulled out of the model's answer goes through
//      `numOrNull` below rather than a bare `Number(...)` — `Number(false)`
//      is `0`, `Number('')` is `0`, `Number(undefined)` is `NaN`, and every
//      one of those would silently become a plausible-looking measurement
//      instead of an honest "couldn't read this."
//
//   3. A PRINTED LABEL AND OUR FIELD NAME ARE NOT A PROMISE OF A MATCH. The
//      first real scan (2026-09-17) failed the gate because the prompt asked
//      for `printed.muscle_mass_lb` and the model, finding no row on the
//      report actually labelled "Muscle Mass," reasonably grabbed the
//      closest-sounding row instead: "Skeletal Muscle" (102.4), which is a
//      DIFFERENT quantity already captured as its own primary. The real
//      muscle-mass figure is printed as "Soft Lean Mass" (164.6). Every other
//      primary and derived value matched exactly — see
//      `bodyCompositionDerivation.js`'s `classifyMismatches` — so the data
//      was fine and only this one label mapping was wrong. `buildUserPrompt`
//      below now spells out that specific pair by name AND tells the model
//      to return `null` rather than borrow a similar-looking row for ANY
//      field, but if the vendor's report layout changes again, re-check every
//      field name here against the actual printed labels rather than
//      assuming they still line up.
//
// This runs on a FREE-TIER model (aiGeekClient's `need: 'vision:*'` routes to
// whatever the rotation currently has that can see an image — no paid pin).
// That means the response is treated as adversarial input, not a well-formed
// API payload: prose before or after the JSON, a markdown code fence around
// it, a missing key, a stringified number, a hedge like "approximately 44.2"
// where a clean number was asked for. Every parsing step below assumes the
// worst and falls back to `null` rather than throwing.

import aiGeekClient, { imagePart } from './aiGeekClient.js';
import { prepareImagesForExtraction } from './bodyCompImagePrep.js';
import { validate } from '@geeksuite/schemas/fitnessgeek/bodyCompositionDerivation';
import logger from '../config/logger.js';

/** The five segments, in report order — reused for prompt text and parsing alike. */
const SEGMENTS = Object.freeze(['left_arm', 'right_arm', 'trunk', 'left_leg', 'right_leg']);

const SYSTEM_PROMPT =
  'You transcribe numbers from a body-composition scale report image into JSON. ' +
  'You copy digits exactly as printed — you never calculate, convert, round, or estimate anything. ' +
  "If a number is not visible or legible, you return null for it rather than a guess. " +
  'Respond with ONLY a single JSON object: no markdown code fences, no explanation before or after it.';

const RESPONSE_SHAPE = `{
  "measured_at": "<the date/time printed on the report, e.g. \\"09/16/2026 08:01\\">",
  "height_cm": <height in CENTIMETRES only, or null -- see the height rule below>,
  "primaries": {
    "weight_value": <lb>, "body_fat_mass_lb": <lb>, "body_water_l": <litres, NOT lb>,
    "protein_lb": <lb>, "bone_mass_lb": <lb>,
    "skeletal_muscle_lb": <lb -- the row literally labelled "Skeletal Muscle". This is NOT "Soft Lean Mass" below -- they are two different rows on the report>,
    "subcutaneous_fat_lb": <lb>, "visceral_fat_index": <unitless index, not a mass>
  },
  "segments": {
    "left_arm":  { "muscle_lb": <lb>, "fat_lb": <lb> },
    "right_arm": { "muscle_lb": <lb>, "fat_lb": <lb> },
    "trunk":     { "muscle_lb": <lb>, "fat_lb": <lb> },
    "left_leg":  { "muscle_lb": <lb>, "fat_lb": <lb> },
    "right_leg": { "muscle_lb": <lb>, "fat_lb": <lb> }
  },
  "printed": {
    "fat_free_mass_lb": <lb -- the row labelled "Fat-Free Mass">,
    "muscle_mass_lb": <lb -- the row labelled "Soft Lean Mass". The report does NOT print a row labelled "Muscle Mass" -- "Soft Lean Mass" IS the muscle-mass figure. Do NOT use "Skeletal Muscle" here, it is a different, separately-reported quantity (see primaries.skeletal_muscle_lb above). If no row you can confidently call the muscle-mass figure is legible, return null -- do not substitute a similar-looking row.>,
    "body_fat_pct": <%>, "body_water_pct": <%>, "protein_pct": <%>,
    "bone_mass_pct": <%>, "skeletal_muscle_pct": <% -- the percentage next to "Skeletal Muscle", not next to "Soft Lean Mass">, "subcutaneous_fat_pct": <%>, "muscle_mass_pct": <% -- the percentage next to "Soft Lean Mass">,
    "bmr_kcal": <kcal>, "bmi": <number>, "smi": <number>
  }
}`;

/**
 * Build the user-turn prompt text. `imageCount` only changes the wording —
 * when a tall screenshot was sliced (`bodyCompImagePrep.js`), the model sees
 * several images that are really one report, and needs to be told that
 * explicitly or it tends to treat each slice as a separate, incomplete scan.
 */
function buildUserPrompt(imageCount) {
  const sliceNote = imageCount > 1
    ? `The ${imageCount} attached images are consecutive vertical slices of ONE report, top to bottom — read them together as a single page, not as separate scans.\n\n`
    : '';

  return `${sliceNote}Transcribe every value below exactly as printed on the attached body-composition scan report.

Two groups of numbers exist in the response, and they must come from two DIFFERENT places on the report, never from each other:

- "primaries" and "segments" are what the scale measured — read these directly off the report's own measurement fields.
- "printed" is a SEPARATE set of numbers also printed on the report (often labelled with a "%" sign, or as "BMI", "BMR", "SMI", "Fat-Free Mass", "Soft Lean Mass"). Transcribe these too, by READING them off the page. Do not calculate any of them yourself from the primaries, even though some of them could be calculated that way — we compare your two groups against each other afterward, and if one is computed from the other rather than independently read, that comparison proves nothing.

This report prints two DIFFERENT rows that are easy to confuse with each other, and confusing them is a known, already-observed failure mode -- read carefully:

- "Skeletal Muscle" is one of the "primaries" (skeletal_muscle_lb) — it is its own directly-measured quantity.
- "Soft Lean Mass" is a DIFFERENT row, and it is the one that belongs in "printed.muscle_mass_lb" — this report has no row actually labelled "Muscle Mass", "Soft Lean Mass" is that figure under a different name.
- These two numbers are NOT interchangeable and are typically not close to each other. If you can find "Skeletal Muscle" but not "Soft Lean Mass", that is not license to reuse the Skeletal Muscle number for muscle_mass_lb — return null for muscle_mass_lb instead.

Treat every other field name below the same way: if a field's printed label on the report does not literally match its name here, find the row whose LABEL matches the description, not a nearby row with a similar-sounding one. When nothing on the page confidently matches, the answer is null, never a value borrowed from a different row.

Height needs special care: the report may print height only in feet and inches (e.g. 5'11"). Converting that to centimetres yourself introduces rounding error we cannot use safely. If centimetres are not printed directly on the report, return "height_cm": null rather than converting.

Return null for any individual value you cannot read clearly. Never guess.

Respond with ONLY this JSON shape, values filled in, and nothing else:
${RESPONSE_SHAPE}`;
}

/** Pull the JSON object out of a markdown code fence, if the model wrapped its answer in one. */
function stripCodeFence(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced ? fenced[1] : text;
}

/** Find and parse the first `{...}` object in free-form text. `null` on any failure to do so. */
function extractJsonObject(rawText) {
  const text = typeof rawText === 'string' ? rawText : JSON.stringify(rawText ?? '');
  const stripped = stripCodeFence(text);
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch (error) {
    return null;
  }
}

/**
 * A value only counts if it is cleanly numeric. A bare number passes as-is;
 * a string passes only if it is NOTHING but a number ("140.2") — a hedge
 * like "~140" or a unit like "140.2 lb" fails this on purpose, because a
 * model padding its answer that way is telling us it isn't confident, and
 * §10.2 says an unclear value comes back `null`, not our best parse of it.
 * Anything else (`undefined`, `false`, `"unreadable"`, an object) is `null`.
 */
function numOrNull(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    return Number(value.trim());
  }
  return null;
}

function segmentOrNull(segment) {
  return {
    muscle_lb: numOrNull(segment?.muscle_lb),
    fat_lb: numOrNull(segment?.fat_lb),
  };
}

/** `measured_at` becomes a real `Date`, or `null` if the model's text doesn't parse as one. */
function parseMeasuredAt(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Parse the model's raw answer into the two independent groups the gate
 * needs: the candidate `BodyComposition` primaries/segments, and the
 * `printed` derived values to check them against.
 *
 * Exported (not just used internally) because it is the seam worth testing
 * directly against ugly, realistic free-tier answers — prose before the
 * JSON, a code fence, a missing key — without needing a network mock.
 *
 * @param {*} responseText - `aiGeekClient.feature()`'s `data` — normally a
 *   string, but treated defensively regardless of what actually comes back.
 * @returns {{candidate: object, printed: object, measuredAt: Date|null} | null}
 *   `null` only when no JSON object could be found in the answer at all.
 */
export function parseExtractionResponse(responseText) {
  const parsed = extractJsonObject(responseText);
  if (!parsed || typeof parsed !== 'object') return null;

  const primaries = parsed.primaries && typeof parsed.primaries === 'object' ? parsed.primaries : {};
  const segments = parsed.segments && typeof parsed.segments === 'object' ? parsed.segments : {};
  const printedRaw = parsed.printed && typeof parsed.printed === 'object' ? parsed.printed : {};

  const candidate = {
    weight_value: numOrNull(primaries.weight_value),
    body_fat_mass_lb: numOrNull(primaries.body_fat_mass_lb),
    body_water_l: numOrNull(primaries.body_water_l),
    protein_lb: numOrNull(primaries.protein_lb),
    bone_mass_lb: numOrNull(primaries.bone_mass_lb),
    skeletal_muscle_lb: numOrNull(primaries.skeletal_muscle_lb),
    subcutaneous_fat_lb: numOrNull(primaries.subcutaneous_fat_lb),
    visceral_fat_index: numOrNull(primaries.visceral_fat_index),
    height_cm: numOrNull(parsed.height_cm),
  };
  for (const segment of SEGMENTS) {
    candidate[segment] = segmentOrNull(segments[segment]);
  }

  const printed = {
    fat_free_mass_lb: numOrNull(printedRaw.fat_free_mass_lb),
    muscle_mass_lb: numOrNull(printedRaw.muscle_mass_lb),
    body_fat_pct: numOrNull(printedRaw.body_fat_pct),
    body_water_pct: numOrNull(printedRaw.body_water_pct),
    protein_pct: numOrNull(printedRaw.protein_pct),
    bone_mass_pct: numOrNull(printedRaw.bone_mass_pct),
    skeletal_muscle_pct: numOrNull(printedRaw.skeletal_muscle_pct),
    subcutaneous_fat_pct: numOrNull(printedRaw.subcutaneous_fat_pct),
    muscle_mass_pct: numOrNull(printedRaw.muscle_mass_pct),
    bmr_kcal: numOrNull(printedRaw.bmr_kcal),
    bmi: numOrNull(printedRaw.bmi),
    smi: numOrNull(printedRaw.smi),
  };

  return { candidate, printed, measuredAt: parseMeasuredAt(parsed.measured_at) };
}

/**
 * Run the full extraction: prepare the stored file's bytes for a vision
 * model, ask it to transcribe the report, and run the arithmetic gate
 * against its answer.
 *
 * This function NEVER throws and never turns an unavailable model into a
 * stack trace — matching `aiGeekClient`'s own rule 1, one layer up. Every
 * outcome, good or bad, comes back as a value on `ok`/`stage`/`code` the
 * caller can render directly.
 *
 * @param {{buffer: Buffer, mimeType: string, userId: string}} params
 * @returns {Promise<
 *   {ok: true, candidate: object, measuredAt: Date|null, printed: object,
 *    validation: ReturnType<import('@geeksuite/schemas/fitnessgeek/bodyCompositionDerivation').validate>,
 *    provenance: object} |
 *   {ok: false, stage: 'prepare'|'model'|'parse', code: string, message: string, provenance: object|null}
 * >}
 */
export async function extractBodyComposition({ buffer, mimeType, userId }) {
  const prep = await prepareImagesForExtraction({ buffer, mimeType });
  if (!prep.ok) {
    logger.warn({ userId, code: prep.code }, 'bodyCompExtractionService: could not prepare the file for a vision call');
    return { ok: false, stage: 'prepare', code: prep.code, message: prep.message, provenance: null };
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: buildUserPrompt(prep.images.length) },
        ...prep.images.map((image) => imagePart(image.mediaType, image.data)),
      ],
    },
  ];

  const result = await aiGeekClient.feature('bodyCompExtract', {
    messages,
    // 'balanced', not 'fast': this runs once per weigh-in, off the critical
    // path a user is staring at (contrast aiFoodService's inline dish
    // estimate), and reading a dense report image correctly is worth more
    // here than shaving a few seconds.
    need: 'vision:balanced',
    // Per-user cap bucket — see aiGeekClient.js's header on why this
    // service key needs one at all (no session on a service-key call).
    quotaKey: userId,
    maxTokens: 1500,
    // Zero temperature: this is transcription, not a place to want variety.
    temperature: 0,
  }, { timeoutMs: 45000 });

  if (!result.ok) {
    logger.warn({ userId, reason: result.reason }, 'bodyCompExtractionService: aiGeek call did not succeed');
    return { ok: false, stage: 'model', code: result.reason, message: result.message, provenance: result.provenance };
  }

  const parsed = parseExtractionResponse(result.data);
  if (!parsed) {
    logger.warn({ userId }, 'bodyCompExtractionService: no JSON object found in the model\'s answer');
    return {
      ok: false,
      stage: 'parse',
      code: 'UNPARSEABLE',
      message: "Could not read the model's answer.",
      provenance: result.provenance,
    };
  }

  const validation = validate(parsed.candidate, parsed.printed);

  return {
    ok: true,
    candidate: parsed.candidate,
    measuredAt: parsed.measuredAt,
    printed: parsed.printed,
    validation,
    provenance: result.provenance,
  };
}

export default { extractBodyComposition, parseExtractionResponse };
