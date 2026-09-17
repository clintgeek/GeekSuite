// POST /api/body-comp/uploads/:id/extract — the wiring: a good extraction
// saves, a mismatch does not, and a duplicate reports as already-imported
// rather than a 500.
//
// The upload itself is real disk I/O (the same temp-dir pattern
// bodyCompUploads.test.js uses) so this suite also exercises the real
// `getUpload` ownership check. `aiGeekClient` and the `BodyComposition`
// model are mocked at the module boundary -- same shape as weight.test.js.

const mod = (p) => new URL(p, import.meta.url).pathname;

import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { Jimp, JimpMime } from 'jimp';

jest.unstable_mockModule(mod('../../middleware/auth.js'), () => ({
  authenticateToken: (req, res, next) => {
    const userId = req.header('x-test-user');
    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });
    req.user = { id: userId, _id: userId, userId };
    next();
  },
  optionalAuth: (req, res, next) => next(),
}));

jest.unstable_mockModule(mod('../../services/aiGeekClient.js'), () => ({
  __esModule: true,
  default: { feature: jest.fn() },
  imagePart: (mediaType, data) => ({ type: 'image', mediaType, data }),
  UNAVAILABLE_MESSAGE: "The assistant isn't available right now.",
}));

jest.unstable_mockModule(mod('../../models/BodyComposition.js'), () => {
  const BodyComposition = jest.fn();
  BodyComposition.create = jest.fn();
  return { __esModule: true, default: BodyComposition };
});

let tempUploadDir;
beforeAll(async () => {
  tempUploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fitnessgeek-body-comp-extract-test-'));
  process.env.BODY_COMP_UPLOAD_DIR = tempUploadDir;
});
afterAll(async () => {
  delete process.env.BODY_COMP_UPLOAD_DIR;
  await fs.rm(tempUploadDir, { recursive: true, force: true });
});

const { default: aiGeekClient } = await import('../../services/aiGeekClient.js');
const { default: BodyComposition } = await import('../../models/BodyComposition.js');
const { saveUpload } = await import('../../services/bodyCompUploadStorage.js');
const { default: bodyCompRoutes } = await import('../../routes/bodyCompRoutes.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/body-comp', bodyCompRoutes);
  return app;
}

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

/** Store a tiny real JPEG the same way the upload endpoint does, and return its id. */
async function seedUpload(userId) {
  const image = new Jimp({ width: 4, height: 4, color: 0x808080ff });
  const buffer = await image.getBuffer(JimpMime.jpeg);
  const metadata = await saveUpload({ buffer, mimeType: 'image/jpeg', originalName: 'scan.jpg', userId });
  return metadata.id;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/body-comp/uploads/:id/extract', () => {
  test('requires authentication', async () => {
    const id = await seedUpload('user-1');
    const res = await request(buildApp()).post(`/api/body-comp/uploads/${id}/extract`);
    expect(res.status).toBe(401);
  });

  test('404s on an id that does not exist', async () => {
    const res = await request(buildApp())
      .post('/api/body-comp/uploads/00000000-0000-4000-8000-000000000000/extract')
      .set('x-test-user', 'user-1');
    expect(res.status).toBe(404);
  });

  test("404s (not 403) on another user's upload -- ownership doesn't leak", async () => {
    const id = await seedUpload('user-owner');
    const res = await request(buildApp())
      .post(`/api/body-comp/uploads/${id}/extract`)
      .set('x-test-user', 'user-other');
    expect(res.status).toBe(404);
  });

  test('a correct transcription saves a BodyComposition row with the right provenance and UTC dates', async () => {
    const id = await seedUpload('user-1');
    aiGeekClient.feature.mockResolvedValue({ ok: true, data: modelAnswer(), reason: null, provenance: { provider: 'groq' } });
    BodyComposition.create.mockResolvedValue({ _id: 'saved-doc-id', toObject: () => ({}) });

    const res = await request(buildApp())
      .post(`/api/body-comp/uploads/${id}/extract`)
      .set('x-test-user', 'user-1');

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('saved');

    expect(BodyComposition.create).toHaveBeenCalledTimes(1);
    const [doc] = BodyComposition.create.mock.calls[0];
    expect(doc.userId).toBe('user-1');
    expect(doc.weight_value).toBe(317.2);
    expect(doc.source).toBe('arboleaf_image');
    expect(doc.extraction.validation_passed).toBe(true);

    // measured_at is the full instant; log_date is UTC midnight of that same
    // day -- THE_CONTEXT.md §3.1, restated in bodyComposition.js's header.
    expect(doc.measured_at.toISOString()).toBe('2026-09-16T08:01:00.000Z');
    expect(doc.log_date.toISOString()).toBe('2026-09-16T00:00:00.000Z');
  });

  test('a mismatched scan does NOT save, and returns the per-check detail', async () => {
    const id = await seedUpload('user-1');
    const raw = JSON.parse(modelAnswer());
    raw.primaries.body_fat_mass_lb = 104.2; // a transposed digit
    aiGeekClient.feature.mockResolvedValue({ ok: true, data: JSON.stringify(raw), reason: null, provenance: {} });

    const res = await request(buildApp())
      .post(`/api/body-comp/uploads/${id}/extract`)
      .set('x-test-user', 'user-1');

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('mismatch');
    expect(res.body.data.validation.passed).toBe(false);
    expect(res.body.data.validation.mismatches.length).toBeGreaterThan(0);
    expect(BodyComposition.create).not.toHaveBeenCalled();

    // A genuinely misread primary (body_fat_mass_lb feeds several checks)
    // must NOT classify as safe to accept -- see the /accept tests below for
    // the case that should.
    expect(res.body.data.classification.safeToAccept).toBe(false);
    expect(res.body.data.classification.suspectPrimaries).toContain('body_fat_mass_lb');
  });

  test('the real printed-only mismatch (a misread "Muscle Mass" witness) classifies as safe to accept', async () => {
    const id = await seedUpload('user-1');
    const raw = JSON.parse(modelAnswer());
    // The actual 2026-09-17 failure: the model found no row labelled "Muscle
    // Mass," so it grabbed "Skeletal Muscle" (102.4) for printed.muscle_mass_lb
    // instead of "Soft Lean Mass" (164.6). Every primary is untouched here --
    // this is purely a bad printed witness.
    raw.printed.muscle_mass_lb = 102.4;
    aiGeekClient.feature.mockResolvedValue({ ok: true, data: JSON.stringify(raw), reason: null, provenance: {} });

    const res = await request(buildApp())
      .post(`/api/body-comp/uploads/${id}/extract`)
      .set('x-test-user', 'user-1');

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('mismatch');
    expect(res.body.data.classification.safeToAccept).toBe(true);
    expect(res.body.data.classification.suspectPrimaries).toEqual([]);
    // The candidate/printed/measuredAt round-trip needed by POST .../accept.
    expect(res.body.data.candidate.weight_value).toBe(317.2);
    expect(res.body.data.measuredAt).toBe('2026-09-16T08:01:00.000Z');
    expect(BodyComposition.create).not.toHaveBeenCalled();
  });

  test('a scan that verifies NOTHING (checked: 0) does not save even though validate() passes vacuously', async () => {
    const id = await seedUpload('user-1');
    aiGeekClient.feature.mockResolvedValue({
      ok: true,
      data: JSON.stringify({ measured_at: null, height_cm: null, primaries: {}, segments: {}, printed: {} }),
      reason: null,
      provenance: {},
    });

    const res = await request(buildApp())
      .post(`/api/body-comp/uploads/${id}/extract`)
      .set('x-test-user', 'user-1');

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('mismatch');
    expect(BodyComposition.create).not.toHaveBeenCalled();
  });

  test('a duplicate (userId, measured_at) reports "already imported", not a 500', async () => {
    const id = await seedUpload('user-1');
    aiGeekClient.feature.mockResolvedValue({ ok: true, data: modelAnswer(), reason: null, provenance: {} });
    const duplicateError = new Error('E11000 duplicate key error');
    duplicateError.code = 11000;
    BodyComposition.create.mockRejectedValue(duplicateError);

    const res = await request(buildApp())
      .post(`/api/body-comp/uploads/${id}/extract`)
      .set('x-test-user', 'user-1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('duplicate');
  });

  test('an unavailable model comes back as a renderable status, not a 500', async () => {
    const id = await seedUpload('user-1');
    aiGeekClient.feature.mockResolvedValue({
      ok: false, data: null, reason: 'unavailable',
      message: "The assistant isn't available right now.", provenance: { source: 'none' },
    });

    const res = await request(buildApp())
      .post(`/api/body-comp/uploads/${id}/extract`)
      .set('x-test-user', 'user-1');

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('extraction_failed');
    expect(res.body.data.stage).toBe('model');
    expect(BodyComposition.create).not.toHaveBeenCalled();
  });

  test('an actual save failure (not a duplicate) is a real 500', async () => {
    const id = await seedUpload('user-1');
    aiGeekClient.feature.mockResolvedValue({ ok: true, data: modelAnswer(), reason: null, provenance: {} });
    BodyComposition.create.mockRejectedValue(new Error('mongo is on fire'));

    const res = await request(buildApp())
      .post(`/api/body-comp/uploads/${id}/extract`)
      .set('x-test-user', 'user-1');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/body-comp/uploads/:id/accept', () => {
  test('requires authentication', async () => {
    const id = await seedUpload('user-1');
    const res = await request(buildApp())
      .post(`/api/body-comp/uploads/${id}/accept`)
      .send({ candidate: SCAN, printed: PRINTED, measuredAt: '2026-09-16T08:01:00.000Z' });
    expect(res.status).toBe(401);
  });

  test('a printed-only mismatch (bad "Muscle Mass" witness) saves, honestly marked as not gate-verified', async () => {
    const id = await seedUpload('user-1');
    // Same shape the /extract mismatch response would have handed the UI:
    // every PRIMARY is untouched, only the printed witness for muscle mass
    // is wrong (the real 2026-09-17 failure -- see classifyMismatches's own
    // test fixture).
    const badPrinted = { ...PRINTED, muscle_mass_lb: 102.4 };
    BodyComposition.create.mockResolvedValue({ _id: 'saved-doc-id', toObject: () => ({}) });

    const res = await request(buildApp())
      .post(`/api/body-comp/uploads/${id}/accept`)
      .set('x-test-user', 'user-1')
      .send({ candidate: SCAN, printed: badPrinted, measuredAt: '2026-09-16T08:01:00Z' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('saved');

    expect(BodyComposition.create).toHaveBeenCalledTimes(1);
    const [doc] = BodyComposition.create.mock.calls[0];
    // Honest bookkeeping: this was NOT a clean gate pass, and the row must
    // say so even though it was saved -- a reader (or a later trend) needs
    // to be able to tell "the arithmetic actually agreed" from "a human
    // decided to save it anyway."
    expect(doc.extraction.validation_passed).toBe(false);
    expect(doc.extraction.method).toBe('aiGeek:bodyCompExtract+partialAccept');
    // The row explains itself later without needing this request's
    // ephemeral validation result to still exist anywhere.
    expect(doc.notes).toMatch(/Muscle mass/);
    expect(doc.weight_value).toBe(317.2);
    expect(doc.measured_at.toISOString()).toBe('2026-09-16T08:01:00.000Z');
  });

  test('the server refuses a primary-suspect mismatch, even though the client never claimed it was safe', async () => {
    const id = await seedUpload('user-1');
    // Bone mass feeds muscle mass AND its own percentage, and nothing else
    // confirms it -- a genuinely bad primary, not a bad witness. The
    // request carries no "safeToAccept" field at all: this endpoint must
    // reject it on its OWN re-derivation, not on anything the client sent.
    const badCandidate = { ...SCAN, bone_mass_lb: 21.4 };

    const res = await request(buildApp())
      .post(`/api/body-comp/uploads/${id}/accept`)
      .set('x-test-user', 'user-1')
      .send({ candidate: badCandidate, printed: PRINTED, measuredAt: '2026-09-16T08:01:00Z' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('refused');
    expect(res.body.data.classification.safeToAccept).toBe(false);
    expect(res.body.data.classification.suspectPrimaries).toContain('bone_mass_lb');
    expect(BodyComposition.create).not.toHaveBeenCalled();
  });

  test('a request that LIES about safety (a fabricated "safeToAccept" field) is still refused', async () => {
    // The endpoint contract: only `candidate`/`printed`/`measuredAt` are
    // ever read from the body. A caller attaching its own verdict must have
    // zero effect -- the gate and classifier are re-run from the numbers
    // alone, every time.
    const id = await seedUpload('user-1');
    const badCandidate = { ...SCAN, weight_value: 371.2 }; // implicates weight loudly

    const res = await request(buildApp())
      .post(`/api/body-comp/uploads/${id}/accept`)
      .set('x-test-user', 'user-1')
      .send({
        candidate: badCandidate,
        printed: PRINTED,
        measuredAt: '2026-09-16T08:01:00Z',
        safeToAccept: true, // a lie the endpoint must never read
        classification: { safeToAccept: true, suspectPrimaries: [] }, // also a lie
      });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('refused');
    expect(BodyComposition.create).not.toHaveBeenCalled();
  });

  test('a clean candidate (nothing actually mismatched) still saves via accept, marked gate-verified', async () => {
    const id = await seedUpload('user-1');
    BodyComposition.create.mockResolvedValue({ _id: 'saved-doc-id', toObject: () => ({}) });
    const res = await request(buildApp())
      .post(`/api/body-comp/uploads/${id}/accept`)
      .set('x-test-user', 'user-1')
      .send({ candidate: SCAN, printed: PRINTED, measuredAt: '2026-09-16T08:01:00Z' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('saved');
    const [doc] = BodyComposition.create.mock.calls[0];
    expect(doc.extraction.validation_passed).toBe(true);
    expect(doc.extraction.method).toBe('aiGeek:bodyCompExtract');
    // No note is attached at all on a genuinely clean pass -- the schema's
    // own `notes` default ('') applies once this reaches a real model; the
    // call itself just omits the key rather than sending an empty string.
    expect(doc.notes).toBeFalsy();
  });

  test('a duplicate (userId, measured_at) reports "already imported," not a 500', async () => {
    const id = await seedUpload('user-1');
    const duplicateError = new Error('E11000 duplicate key error');
    duplicateError.code = 11000;
    BodyComposition.create.mockRejectedValue(duplicateError);

    const res = await request(buildApp())
      .post(`/api/body-comp/uploads/${id}/accept`)
      .set('x-test-user', 'user-1')
      .send({ candidate: SCAN, printed: { ...PRINTED, muscle_mass_lb: 102.4 }, measuredAt: '2026-09-16T08:01:00Z' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('duplicate');
  });

  test('a missing candidate or printed body is a 400, not a crash', async () => {
    const id = await seedUpload('user-1');
    const res = await request(buildApp())
      .post(`/api/body-comp/uploads/${id}/accept`)
      .set('x-test-user', 'user-1')
      .send({ measuredAt: '2026-09-16T08:01:00Z' });

    expect(res.status).toBe(400);
    expect(BodyComposition.create).not.toHaveBeenCalled();
  });

  test("404s (not 403) on another user's upload -- ownership doesn't leak", async () => {
    const id = await seedUpload('user-owner');
    const res = await request(buildApp())
      .post(`/api/body-comp/uploads/${id}/accept`)
      .set('x-test-user', 'user-other')
      .send({ candidate: SCAN, printed: PRINTED, measuredAt: '2026-09-16T08:01:00Z' });
    expect(res.status).toBe(404);
  });
});
