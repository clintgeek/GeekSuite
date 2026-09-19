// POST /api/body-comp/uploads/:id/import-xlsx — end-to-end wiring: upload the
// REAL Arboleaf export through the real upload endpoint (exercising the
// async xlsx sniff, DOCS/body_comp.xlsx being a genuine zip a naive sniffer
// could easily misjudge), then import it, then re-import the exact same
// bytes and confirm the second pass is all skips, not duplicates or errors.
//
// Same temp-dir-on-disk pattern as bodyCompUploads.test.js/bodyCompExtract.test.js
// (real disk I/O for the upload storage layer) with `BodyComposition` mocked
// at the module boundary — this suite has no live Mongo (jest.setup.js).

const mod = (p) => new URL(p, import.meta.url).pathname;

import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

jest.unstable_mockModule(mod('../../middleware/auth.js'), () => ({
  authenticateToken: (req, res, next) => {
    const userId = req.header('x-test-user');
    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });
    req.user = { id: userId, _id: userId, userId };
    next();
  },
  optionalAuth: (req, res, next) => next(),
}));

let seenKeys;
let nextId;
jest.unstable_mockModule(mod('../../models/BodyComposition.js'), () => {
  const BodyComposition = jest.fn();
  BodyComposition.create = jest.fn(async (doc) => {
    const key = `${doc.userId}|${new Date(doc.measured_at).toISOString()}`;
    if (seenKeys.has(key)) {
      const error = new Error('E11000 duplicate key error');
      error.code = 11000;
      throw error;
    }
    seenKeys.add(key);
    nextId += 1;
    return { ...doc, _id: { toString: () => `mock-id-${nextId}` } };
  });
  return { __esModule: true, default: BodyComposition };
});

let tempUploadDir;
beforeAll(async () => {
  tempUploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fitnessgeek-body-comp-import-test-'));
  process.env.BODY_COMP_UPLOAD_DIR = tempUploadDir;
});
afterAll(async () => {
  delete process.env.BODY_COMP_UPLOAD_DIR;
  await fs.rm(tempUploadDir, { recursive: true, force: true });
});
beforeEach(() => {
  seenKeys = new Set();
  nextId = 0;
});

const { default: bodyCompRoutes } = await import('../../routes/bodyCompRoutes.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/body-comp', bodyCompRoutes);
  return app;
}

const REAL_EXPORT_PATH = path.resolve(process.cwd(), '../../../DOCS/body_comp.xlsx');
const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function uploadRealExport(app, userId = 'user-1') {
  const buffer = await fs.readFile(REAL_EXPORT_PATH);
  const uploadRes = await request(app)
    .post('/api/body-comp/uploads')
    .set('x-test-user', userId)
    .attach('file', buffer, { filename: 'body_comp.xlsx', contentType: XLSX_CONTENT_TYPE });
  return uploadRes;
}

describe('POST /api/body-comp/uploads (xlsx honest sniffing)', () => {
  test('accepts and correctly identifies the REAL Arboleaf .xlsx export', async () => {
    const app = buildApp();
    const uploadRes = await uploadRealExport(app);

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.data.mimeType).toBe(XLSX_CONTENT_TYPE);
  });
});

describe('POST /api/body-comp/uploads/:id/import-xlsx', () => {
  test('requires authentication', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/body-comp/uploads/does-not-matter/import-xlsx');
    expect(res.status).toBe(401);
  });

  test('404s for an unknown upload id', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/body-comp/uploads/00000000-0000-4000-8000-000000000000/import-xlsx')
      .set('x-test-user', 'user-1');
    expect(res.status).toBe(404);
  });

  test('imports all 6 rows of the real export on first upload', async () => {
    const app = buildApp();
    const uploadRes = await uploadRealExport(app);
    const { id } = uploadRes.body.data;

    const importRes = await request(app)
      .post(`/api/body-comp/uploads/${id}/import-xlsx`)
      .set('x-test-user', 'user-1');

    expect(importRes.status).toBe(200);
    expect(importRes.body.data.status).toBe('imported');
    expect(importRes.body.data.imported).toBe(6);
    expect(importRes.body.data.skipped).toBe(0);
    expect(importRes.body.data.failed).toBe(0);
  });

  test('re-importing the SAME uploaded file imports 0 and skips all 6 — no duplicates, no errors', async () => {
    const app = buildApp();
    const uploadRes = await uploadRealExport(app);
    const { id } = uploadRes.body.data;

    const first = await request(app).post(`/api/body-comp/uploads/${id}/import-xlsx`).set('x-test-user', 'user-1');
    expect(first.body.data.imported).toBe(6);

    // Re-importing the SAME upload id — a user hitting "import" twice on
    // one file, or a retried request.
    const second = await request(app).post(`/api/body-comp/uploads/${id}/import-xlsx`).set('x-test-user', 'user-1');
    expect(second.status).toBe(200);
    expect(second.body.data.imported).toBe(0);
    expect(second.body.data.skipped).toBe(6);
    expect(second.body.data.failed).toBe(0);
  });

  test('re-uploading the same bytes as a NEW upload id still dedupes against the earlier import', async () => {
    const app = buildApp();

    const firstUpload = await uploadRealExport(app);
    const firstImport = await request(app)
      .post(`/api/body-comp/uploads/${firstUpload.body.data.id}/import-xlsx`)
      .set('x-test-user', 'user-1');
    expect(firstImport.body.data.imported).toBe(6);

    // A second, independent upload of the identical file — e.g. the user
    // shared the export a second time. Different upload id, same rows.
    const secondUpload = await uploadRealExport(app);
    const secondImport = await request(app)
      .post(`/api/body-comp/uploads/${secondUpload.body.data.id}/import-xlsx`)
      .set('x-test-user', 'user-1');

    expect(secondImport.body.data.imported).toBe(0);
    expect(secondImport.body.data.skipped).toBe(6);
  });

  test('refuses an id that belongs to a non-spreadsheet upload', async () => {
    const app = buildApp();
    const REAL_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    const uploadRes = await request(app)
      .post('/api/body-comp/uploads')
      .set('x-test-user', 'user-1')
      .attach('file', REAL_JPEG, { filename: 'scan.jpg', contentType: 'image/jpeg' });

    const importRes = await request(app)
      .post(`/api/body-comp/uploads/${uploadRes.body.data.id}/import-xlsx`)
      .set('x-test-user', 'user-1');

    expect(importRes.status).toBe(400);
    expect(importRes.body.error.code).toBe('NOT_AN_XLSX_UPLOAD');
  });
});
