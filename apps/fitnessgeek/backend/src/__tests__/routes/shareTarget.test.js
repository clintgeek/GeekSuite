// Web Share Target intake: POST /share-target stages bytes and redirects;
// GET /api/body-comp/share-staged/:id (authenticated) claims them once.
//
// No mocking of the staging module itself — it's a plain in-memory Map, so
// exercising it for real through both routes is cheap and pins the actual
// single-use/expiry contract, not a mock's idea of it.

import { describe, test, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const mod = (p) => new URL(p, import.meta.url).pathname;

jest.unstable_mockModule(mod('../../middleware/auth.js'), () => ({
  authenticateToken: (req, res, next) => {
    const userId = req.header('x-test-user');
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    req.user = { id: userId, _id: userId, userId };
    next();
  },
  optionalAuth: (req, res, next) => next(),
}));

const { default: shareTargetRoutes } = await import('../../routes/shareTargetRoutes.js');
const { default: bodyCompRoutes } = await import('../../routes/bodyCompRoutes.js');
const { __clearAllStagedForTests } = await import('../../services/shareTargetStaging.js');

function buildApp() {
  const app = express();
  app.use('/share-target', shareTargetRoutes);
  app.use('/api/body-comp', bodyCompRoutes);
  return app;
}

const REAL_PDF = Buffer.from('%PDF-1.4\n%test pdf content for staging\n', 'latin1');
const NOT_A_REAL_FILE = Buffer.from('this is just plain text, not a pdf or image', 'utf8');

describe('POST /share-target', () => {
  test('stages a valid file and 303-redirects to /scan-import with a stagedId', async () => {
    const res = await request(buildApp())
      .post('/share-target')
      .attach('file', REAL_PDF, { filename: 'report.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(303);
    const location = new URL(res.headers.location, 'http://localhost');
    expect(location.pathname).toBe('/scan-import');
    expect(location.searchParams.get('stagedId')).toBeTruthy();
    expect(location.searchParams.get('error')).toBeNull();
  });

  test('redirects with error=unsupported_type when content sniffing fails, regardless of declared type', async () => {
    const res = await request(buildApp())
      .post('/share-target')
      // Declares PDF, but the bytes are plain text — sniffing must win.
      .attach('file', NOT_A_REAL_FILE, { filename: 'report.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(303);
    const location = new URL(res.headers.location, 'http://localhost');
    expect(location.searchParams.get('error')).toBe('unsupported_type');
    expect(location.searchParams.get('stagedId')).toBeNull();
  });

  test('redirects with error=no_file when no file field is sent', async () => {
    const res = await request(buildApp()).post('/share-target');
    expect(res.status).toBe(303);
    const location = new URL(res.headers.location, 'http://localhost');
    expect(location.searchParams.get('error')).toBe('no_file');
  });

  test('is reachable with no auth cookie/header at all — it makes no authenticated write', async () => {
    // No x-test-user header, no cookies. If this were guarded by
    // authenticateToken it would 401; it must not be.
    const res = await request(buildApp())
      .post('/share-target')
      .attach('file', REAL_PDF, { filename: 'report.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(303);
  });
});

describe('GET /api/body-comp/share-staged/:id', () => {
  test('requires authentication', async () => {
    const stageRes = await request(buildApp())
      .post('/share-target')
      .attach('file', REAL_PDF, { filename: 'report.pdf', contentType: 'application/pdf' });
    const stagedId = new URL(stageRes.headers.location, 'http://localhost').searchParams.get('stagedId');

    const res = await request(buildApp()).get(`/api/body-comp/share-staged/${stagedId}`);
    expect(res.status).toBe(401);
  });

  test('an authenticated claim returns the staged bytes with the sniffed content-type', async () => {
    const stageRes = await request(buildApp())
      .post('/share-target')
      .attach('file', REAL_PDF, { filename: 'report.pdf', contentType: 'application/pdf' });
    const stagedId = new URL(stageRes.headers.location, 'http://localhost').searchParams.get('stagedId');

    const res = await request(buildApp())
      .get(`/api/body-comp/share-staged/${stagedId}`)
      .set('x-test-user', 'user-1');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(Buffer.from(res.body)).toEqual(REAL_PDF);
  });

  test('is single-use: a second claim of the same id 404s', async () => {
    const stageRes = await request(buildApp())
      .post('/share-target')
      .attach('file', REAL_PDF, { filename: 'report.pdf', contentType: 'application/pdf' });
    const stagedId = new URL(stageRes.headers.location, 'http://localhost').searchParams.get('stagedId');

    const first = await request(buildApp())
      .get(`/api/body-comp/share-staged/${stagedId}`)
      .set('x-test-user', 'user-1');
    expect(first.status).toBe(200);

    const second = await request(buildApp())
      .get(`/api/body-comp/share-staged/${stagedId}`)
      .set('x-test-user', 'user-1');
    expect(second.status).toBe(404);
    expect(second.body.error.code).toBe('STAGED_UPLOAD_NOT_FOUND');
  });

  test('an unknown id 404s', async () => {
    __clearAllStagedForTests();
    const res = await request(buildApp())
      .get('/api/body-comp/share-staged/00000000-0000-0000-0000-000000000000')
      .set('x-test-user', 'user-1');
    expect(res.status).toBe(404);
  });
});
