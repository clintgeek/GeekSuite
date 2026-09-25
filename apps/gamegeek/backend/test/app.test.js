/**
 * createApp() boots without Mongo and answers the routes that don't need it.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import createApp from '../src/app.js';

const app = createApp();

describe('GET /api/health', () => {
  test('answers healthy with database disconnected when Mongo was never connected', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'healthy');
    assert.equal(res.body.database, 'disconnected');
  });
});

describe('auth is required on the routes this backend owns', () => {
  test('GET /api/games/:id/cover with no session -> 401', async () => {
    const res = await request(app).get('/api/games/507f1f77bcf86cd799439011/cover');
    assert.equal(res.status, 401);
  });

  test('GET /api/metadata/providers with no session -> 401', async () => {
    const res = await request(app).get('/api/metadata/providers');
    assert.equal(res.status, 401);
  });

  test('GET /api/metadata/search with no session -> 401', async () => {
    const res = await request(app).get('/api/metadata/search?q=hades');
    assert.equal(res.status, 401);
  });

  test('POST /api/import/steam with no session -> 401', async () => {
    const res = await request(app).post('/api/import/steam').send({ dryRun: true });
    assert.equal(res.status, 401);
  });

  test('GET /api/me with no session -> 401', async () => {
    const res = await request(app).get('/api/me');
    assert.equal(res.status, 401);
  });
});
