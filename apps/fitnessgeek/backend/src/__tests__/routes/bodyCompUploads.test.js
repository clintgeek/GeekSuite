// POST /api/body-comp/uploads — the real, authenticated, validated upload
// endpoint both intake paths (share-target re-post and the manual file
// picker) funnel through.

import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

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

let tempUploadDir;

beforeAll(async () => {
  tempUploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fitnessgeek-body-comp-test-'));
  // Must be set before bodyCompUploadStorage.js is imported by the routes
  // below — it reads the env var at call time (not module load time), so
  // this is really just for clarity/ordering, not a hard requirement.
  process.env.BODY_COMP_UPLOAD_DIR = tempUploadDir;
});

afterAll(async () => {
  delete process.env.BODY_COMP_UPLOAD_DIR;
  await fs.rm(tempUploadDir, { recursive: true, force: true });
});

const { default: bodyCompRoutes } = await import('../../routes/bodyCompRoutes.js');

function buildApp() {
  const app = express();
  app.use('/api/body-comp', bodyCompRoutes);
  return app;
}

const REAL_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

describe('POST /api/body-comp/uploads', () => {
  test('requires authentication', async () => {
    const res = await request(buildApp())
      .post('/api/body-comp/uploads')
      .attach('file', REAL_JPEG, { filename: 'scan.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(401);
  });

  test('rejects a request with no file', async () => {
    const res = await request(buildApp())
      .post('/api/body-comp/uploads')
      .set('x-test-user', 'user-1');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NO_FILE');
  });

  test('rejects content that does not sniff as an allowed type, even with an allowed declared type', async () => {
    const res = await request(buildApp())
      .post('/api/body-comp/uploads')
      .set('x-test-user', 'user-1')
      // Declares image/png, but the bytes are plain text.
      .attach('file', Buffer.from('not actually an image'), { filename: 'scan.png', contentType: 'image/png' });

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  // This is the exact scenario the feature was built to handle: Arboleaf's
  // share names the file with a .png extension, but it's real JPEG bytes.
  test('stores a file whose extension lies about its type, using the sniffed type', async () => {
    const res = await request(buildApp())
      .post('/api/body-comp/uploads')
      .set('x-test-user', 'user-1')
      .attach('file', REAL_JPEG, { filename: 'arboleaf.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.mimeType).toBe('image/jpeg');
    expect(res.body.data.id).toBeTruthy();
    expect(res.body.data.size).toBe(REAL_JPEG.length);

    // Actually landed on disk under the sniffed extension, not .png.
    const storedPath = path.join(tempUploadDir, `${res.body.data.id}.jpg`);
    const onDisk = await fs.readFile(storedPath);
    expect(onDisk).toEqual(REAL_JPEG);

    const sidecar = JSON.parse(await fs.readFile(path.join(tempUploadDir, `${res.body.data.id}.json`), 'utf8'));
    expect(sidecar.userId).toBe('user-1');
    expect(sidecar.mimeType).toBe('image/jpeg');
    expect(sidecar.originalName).toBe('arboleaf.png');
  });

  test('rejects a file over the size limit with 413', async () => {
    const oversized = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff]),
      Buffer.alloc(11 * 1024 * 1024, 0x00), // > 10MB limit
    ]);
    const res = await request(buildApp())
      .post('/api/body-comp/uploads')
      .set('x-test-user', 'user-1')
      .attach('file', oversized, { filename: 'huge.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
  });
});
