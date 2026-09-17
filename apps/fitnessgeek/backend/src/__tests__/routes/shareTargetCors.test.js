// The share target against the REAL app.js, middleware stack and all.
//
// `shareTarget.test.js` covers the route's behaviour, but it builds a bare
// express app with only the routers mounted. That is the right shape for
// testing the handler and it structurally cannot catch anything that happens
// ABOVE the handler — which is where the first real share from a phone failed.
//
// Android sends `Origin: null` for a share-sheet POST: a top-level navigation
// the OS initiated, with the literal four-character string, not an absent
// header. The CORS allow-list rejected it, `cors` called back with an Error,
// and the user got `{"success":false,"error":{"message":"Internal Server
// Error"}}` with nothing in it to suggest CORS. The route was never reached,
// so every route-level test still passed.
//
// So these tests assert on the middleware stack, through the real app.

import { describe, test, expect, jest } from '@jest/globals';
import request from 'supertest';

const axios = jest.fn();
axios.get = jest.fn();
axios.post = jest.fn();
axios.default = axios;

jest.unstable_mockModule('axios', () => axios);
jest.mock('axios', () => axios);

const { default: app } = await import('../../app.js');

describe('POST /share-target with the Origin Android actually sends', () => {
  test('a literal "null" Origin is not a 500', async () => {
    const res = await request(app)
      .post('/share-target')
      .set('Origin', 'null')
      .attach('file', Buffer.from('%PDF-1.4\n'), {
        filename: 'report.pdf',
        contentType: 'application/pdf',
      });

    // What it redirects to is the route's business and is covered elsewhere.
    // The only claim here is that the request survived the middleware stack:
    // anything but a 5xx means CORS did not reject it.
    expect(res.status).toBeLessThan(500);
  });

  test('an absent Origin is still fine', async () => {
    const res = await request(app)
      .post('/share-target')
      .attach('file', Buffer.from('%PDF-1.4\n'), {
        filename: 'report.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBeLessThan(500);
  });
});

describe('the bypass is scoped to that one path', () => {
  test('a literal "null" Origin is still refused everywhere else', async () => {
    // The fix must not become a global "allow opaque origins". Every sandboxed
    // iframe sends `Origin: null`, so widening the allow-list app-wide to serve
    // one navigation would be a real loosening.
    const res = await request(app)
      .post('/api/settings')
      .set('Origin', 'null')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});
