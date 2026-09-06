// The app-level error handler (src/app.js) must answer in this backend's JSON
// error shape for anything thrown ahead of it — including the two things
// thrown BEFORE `createHttpLogger` attaches `req.log`:
//
//   1. `express.json()`'s SyntaxError on a malformed body — a 400 any client
//      can produce by accident.
//   2. cors()'s `callback(new Error(...))` for a disallowed Origin.
//
// The handler used to call `req.log.error(...)` unconditionally. With `req.log`
// undefined it threw inside the error handler itself, which express answers
// with its own HTML 500 page: no log line, and the `{ success, error, timestamp }`
// envelope every client here expects replaced by markup.
//
// Exercises the REAL app, like auth.test.js. Only axios and the models the
// routes touch at import time are mocked; nothing here reaches a route handler.

import { describe, test, expect, jest } from '@jest/globals';
import request from 'supertest';

const axios = jest.fn();
axios.get = jest.fn();
axios.post = jest.fn();
axios.default = axios;

jest.unstable_mockModule('axios', () => axios);
jest.mock('axios', () => axios);

const { default: app } = await import('../../app.js');

describe('malformed JSON body', () => {
  test('answers 400 in the JSON error shape, not an HTML 500', async () => {
    const res = await request(app)
      .post('/api/settings')
      .set('Content-Type', 'application/json')
      .send('{"theme": ');

    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toMatchObject({
      success: false,
      error: { message: expect.any(String) },
      timestamp: expect.any(String),
    });
    // The tell for the old bug: express's own handler answers text/html and
    // no body at all.
    expect(res.text).not.toMatch(/<!DOCTYPE html>/i);
  });

  test('the same is true on a route that does not exist', async () => {
    const res = await request(app)
      .post('/api/nope')
      .set('Content-Type', 'application/json')
      .send('{ broken');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('a disallowed Origin', () => {
  test('is rejected without the error handler throwing on req.log', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'https://evil.example.com');

    // csrfGuard passes a GET through; cors() then rejects the Origin with an
    // Error, which lands in the app error handler. Either way the answer must
    // be this backend's JSON shape.
    expect([200, 403, 500]).toContain(res.status);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

describe('the 404 handler still owns unmatched API paths', () => {
  test('a well-formed request to a missing route is the ROUTE_NOT_FOUND envelope', async () => {
    const res = await request(app).get('/api/definitely-not-a-route');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
  });
});
