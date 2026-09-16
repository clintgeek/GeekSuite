// bodyCompExtractionService — the extraction contract (DOCS/BODY_COMPOSITION_INTAKE.md §10).
//
// `parseExtractionResponse` is exercised directly against ugly, realistic
// free-tier answers (prose, markdown fences, missing/hedged values) with no
// network involved. `extractBodyComposition` is exercised end to end with
// aiGeekClient mocked at the module boundary, the same shape every other
// suite in this app uses for it.
//
// The fixture values below are lifted verbatim from
// src/__tests__/models/bodyCompositionDerivation.test.js's own SCAN/PRINTED
// -- the real 2026-09-16 Arboleaf scan -- per this task's own instruction to
// reuse known-correct numbers rather than invent any.

const mod = (p) => new URL(p, import.meta.url).pathname;

import { describe, test, expect, jest, beforeAll } from '@jest/globals';
import { Jimp, JimpMime } from 'jimp';

jest.unstable_mockModule(mod('../../services/aiGeekClient.js'), () => ({
  __esModule: true,
  default: { feature: jest.fn() },
  imagePart: (mediaType, data) => ({ type: 'image', mediaType, data }),
  UNAVAILABLE_MESSAGE: "The assistant isn't available right now.",
}));

const { default: aiGeekClient } = await import('../../services/aiGeekClient.js');
const { parseExtractionResponse, extractBodyComposition } = await import('../../services/bodyCompExtractionService.js');

/** The real primaries, exactly as the reference report gives them. */
const SCAN = Object.freeze({
  weight_value: 317.2,
  body_fat_mass_lb: 140.2,
  body_water_l: 59.4,
  protein_lb: 33.6,
  bone_mass_lb: 12.4,
  skeletal_muscle_lb: 102.4,
  subcutaneous_fat_lb: 112,
  visceral_fat_index: 20,
  height_cm: 180,
  left_arm: { muscle_lb: 11, fat_lb: 13 },
  right_arm: { muscle_lb: 12.4, fat_lb: 12.6 },
  trunk: { muscle_lb: 86.4, fat_lb: 74.8 },
  left_leg: { muscle_lb: 28.6, fat_lb: 17.8 },
  right_leg: { muscle_lb: 28.8, fat_lb: 17.8 },
});

/** The derived values as PRINTED on that same report. */
const PRINTED = Object.freeze({
  fat_free_mass_lb: 177,
  muscle_mass_lb: 164.6,
  body_fat_pct: 44.2,
  body_water_pct: 41.3,
  protein_pct: 10.6,
  bone_mass_pct: 3.9,
  skeletal_muscle_pct: 32.3,
  subcutaneous_fat_pct: 35.3,
  muscle_mass_pct: 51.9,
  bmr_kcal: 2105,
  bmi: 44.4,
  smi: 11.3,
});

function modelAnswer(overrides = {}) {
  return JSON.stringify({
    measured_at: '2026-09-16T08:01:00Z',
    height_cm: SCAN.height_cm,
    primaries: {
      weight_value: SCAN.weight_value,
      body_fat_mass_lb: SCAN.body_fat_mass_lb,
      body_water_l: SCAN.body_water_l,
      protein_lb: SCAN.protein_lb,
      bone_mass_lb: SCAN.bone_mass_lb,
      skeletal_muscle_lb: SCAN.skeletal_muscle_lb,
      subcutaneous_fat_lb: SCAN.subcutaneous_fat_lb,
      visceral_fat_index: SCAN.visceral_fat_index,
    },
    segments: {
      left_arm: SCAN.left_arm,
      right_arm: SCAN.right_arm,
      trunk: SCAN.trunk,
      left_leg: SCAN.left_leg,
      right_leg: SCAN.right_leg,
    },
    printed: PRINTED,
    ...overrides,
  });
}

describe('parseExtractionResponse — defensive parsing of a free-tier answer', () => {
  test('a clean JSON answer parses completely', () => {
    const parsed = parseExtractionResponse(modelAnswer());
    expect(parsed.candidate.weight_value).toBe(317.2);
    expect(parsed.candidate.left_arm).toEqual({ muscle_lb: 11, fat_lb: 13 });
    expect(parsed.printed.bmi).toBe(44.4);
    expect(parsed.measuredAt).toBeInstanceOf(Date);
    expect(parsed.measuredAt.toISOString()).toBe('2026-09-16T08:01:00.000Z');
  });

  test('prose wrapped around the JSON is stripped', () => {
    const wrapped = `Sure, here is the transcription you asked for:\n\n${modelAnswer()}\n\nLet me know if you need anything else!`;
    const parsed = parseExtractionResponse(wrapped);
    expect(parsed.candidate.weight_value).toBe(317.2);
  });

  test('a markdown code fence around the JSON is stripped', () => {
    const fenced = '```json\n' + modelAnswer() + '\n```';
    const parsed = parseExtractionResponse(fenced);
    expect(parsed.candidate.weight_value).toBe(317.2);
    expect(parsed.printed.smi).toBe(11.3);
  });

  test('a missing key becomes null, never a guess', () => {
    const raw = JSON.parse(modelAnswer());
    delete raw.primaries.body_fat_mass_lb; // the model just didn't return this key at all
    const parsed = parseExtractionResponse(JSON.stringify(raw));
    expect(parsed.candidate.body_fat_mass_lb).toBeNull();
    // Everything else the model DID return still comes through.
    expect(parsed.candidate.weight_value).toBe(317.2);
  });

  test('a hedged/unclear value ("approximately 44.2", "unreadable") becomes null, not a parsed guess', () => {
    const raw = JSON.parse(modelAnswer());
    raw.printed.bmi = 'approximately 44.2';
    raw.primaries.protein_lb = 'unreadable';
    raw.height_cm = null;
    const parsed = parseExtractionResponse(JSON.stringify(raw));
    expect(parsed.printed.bmi).toBeNull();
    expect(parsed.candidate.protein_lb).toBeNull();
    expect(parsed.candidate.height_cm).toBeNull();
  });

  test('a clean numeric STRING is still accepted (type normalization is not "guessing")', () => {
    const raw = JSON.parse(modelAnswer());
    raw.primaries.weight_value = '317.2';
    const parsed = parseExtractionResponse(JSON.stringify(raw));
    expect(parsed.candidate.weight_value).toBe(317.2);
  });

  test('false/boolean and empty-string values become null, never 0', () => {
    const raw = JSON.parse(modelAnswer());
    raw.primaries.bone_mass_lb = false;
    raw.primaries.protein_lb = '';
    const parsed = parseExtractionResponse(JSON.stringify(raw));
    expect(parsed.candidate.bone_mass_lb).toBeNull();
    expect(parsed.candidate.protein_lb).toBeNull();
  });

  test('an unparseable measured_at becomes a null Date rather than the epoch', () => {
    const raw = JSON.parse(modelAnswer());
    raw.measured_at = 'sometime in the morning';
    const parsed = parseExtractionResponse(JSON.stringify(raw));
    expect(parsed.measuredAt).toBeNull();
  });

  test('no JSON object anywhere in the answer returns null, not a throw', () => {
    expect(parseExtractionResponse('I could not read this report clearly enough to transcribe it.')).toBeNull();
    expect(parseExtractionResponse('')).toBeNull();
    expect(parseExtractionResponse(undefined)).toBeNull();
  });

  test('a missing segment object comes back with both its fields null, not an exception', () => {
    const raw = JSON.parse(modelAnswer());
    delete raw.segments.trunk;
    const parsed = parseExtractionResponse(JSON.stringify(raw));
    expect(parsed.candidate.trunk).toEqual({ muscle_lb: null, fat_lb: null });
  });
});

describe('extractBodyComposition — the full flow, aiGeek mocked', () => {
  // A trivial but REAL, decodable JPEG -- small enough that bodyCompImagePrep
  // passes it through unsliced, so this suite doesn't need an actual report
  // image to exercise the aiGeek-call-and-validate wiring around it.
  let TINY_JPEG;
  beforeAll(async () => {
    const image = new Jimp({ width: 4, height: 4, color: 0x808080ff });
    TINY_JPEG = await image.getBuffer(JimpMime.jpeg);
  });

  test('a correct transcription is reported as a clean pass, with provenance carried through', async () => {
    aiGeekClient.feature.mockResolvedValue({
      ok: true,
      data: modelAnswer(),
      reason: null,
      provenance: { source: 'live', provider: 'groq', model: 'llama-vision', cached: false },
    });

    const result = await extractBodyComposition({ buffer: TINY_JPEG, mimeType: 'image/jpeg', userId: 'user-1' });

    expect(result.ok).toBe(true);
    expect(result.validation.passed).toBe(true);
    expect(result.validation.checked).toBe(12);
    expect(result.candidate.weight_value).toBe(317.2);
    expect(result.provenance.provider).toBe('groq');

    // The call itself must ask for a vision-capable model and carry an
    // image content-part, not a plain string -- this is the one thing that
    // silently breaks the whole feature if it regresses.
    const [featureName, payload] = aiGeekClient.feature.mock.calls[0];
    expect(featureName).toBe('bodyCompExtract');
    expect(payload.need).toBe('vision:balanced');
    const userMessage = payload.messages.find((m) => m.role === 'user');
    expect(Array.isArray(userMessage.content)).toBe(true);
    expect(userMessage.content.some((part) => part.type === 'image')).toBe(true);
  });

  test('a mismatched primary is reported as a failed validation, not swallowed', async () => {
    const raw = JSON.parse(modelAnswer());
    raw.primaries.body_fat_mass_lb = 104.2; // transposed digit
    aiGeekClient.feature.mockResolvedValue({ ok: true, data: JSON.stringify(raw), reason: null, provenance: {} });

    const result = await extractBodyComposition({ buffer: TINY_JPEG, mimeType: 'image/jpeg', userId: 'user-1' });

    expect(result.ok).toBe(true); // the CALL succeeded -- the GATE is what caught it
    expect(result.validation.passed).toBe(false);
    expect(result.validation.mismatches.length).toBeGreaterThan(0);
  });

  test('an unavailable model is a value, not a throw', async () => {
    aiGeekClient.feature.mockResolvedValue({
      ok: false,
      data: null,
      reason: 'unavailable',
      message: "The assistant isn't available right now.",
      provenance: { source: 'none' },
    });

    const result = await extractBodyComposition({ buffer: TINY_JPEG, mimeType: 'image/jpeg', userId: 'user-1' });
    expect(result.ok).toBe(false);
    expect(result.stage).toBe('model');
    expect(result.code).toBe('unavailable');
  });

  test('an unparseable answer is reported at the parse stage, not thrown', async () => {
    aiGeekClient.feature.mockResolvedValue({ ok: true, data: 'Sorry, I cannot read this image.', reason: null, provenance: {} });

    const result = await extractBodyComposition({ buffer: TINY_JPEG, mimeType: 'image/jpeg', userId: 'user-1' });
    expect(result.ok).toBe(false);
    expect(result.stage).toBe('parse');
    expect(result.code).toBe('UNPARSEABLE');
  });

  test('a bad file (fails image prep) is reported at the prepare stage without ever calling aiGeek', async () => {
    const result = await extractBodyComposition({
      buffer: Buffer.from('not an image'),
      mimeType: 'image/png',
      userId: 'user-1',
    });
    expect(result.ok).toBe(false);
    expect(result.stage).toBe('prepare');
    expect(aiGeekClient.feature).not.toHaveBeenCalled();
  });

  test('a scan that verifies nothing at all still reports checked: 0 -- callers must not treat this as clean', async () => {
    // Every value came back unreadable. validate({}, {}) passes VACUOUSLY --
    // this is exactly the trap DOCS/BODY_COMPOSITION_INTAKE.md §10.5 warns
    // about, and it's the caller's (the controller's) job to read `checked`,
    // not just `passed`. This test pins that the service hands `checked`
    // through so that guard is possible.
    aiGeekClient.feature.mockResolvedValue({
      ok: true,
      data: JSON.stringify({ measured_at: null, height_cm: null, primaries: {}, segments: {}, printed: {} }),
      reason: null,
      provenance: {},
    });

    const result = await extractBodyComposition({ buffer: TINY_JPEG, mimeType: 'image/jpeg', userId: 'user-1' });
    expect(result.ok).toBe(true);
    expect(result.validation.passed).toBe(true);
    expect(result.validation.checked).toBe(0);
  });
});
