// Input-validation coverage for routes/auth.js's POST /refresh body
// (refreshToken, app), added as part of DOCS/TODO_ORDER.md #22 (storygeek
// slice). GET /me and POST /logout take no validatable body — see the
// report for why they're out of scope.
//
// Hermetic: axios is mocked so no network call reaches basegeek.

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const mod = (p) => new URL(p, import.meta.url).pathname;

const mockAxiosPost = jest.fn();
jest.unstable_mockModule('axios', () => ({
  default: { get: jest.fn(), post: mockAxiosPost },
}));

const { default: authRoutes } = await import(mod('../../routes/auth.js'));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/auth/refresh validation', () => {
  test('accepted: a plausible refreshToken + app reaches basegeek', async () => {
    mockAxiosPost.mockResolvedValue({ status: 200, data: { success: true }, headers: {} });

    const res = await request(buildApp())
      .post('/api/auth/refresh')
      .send({ refreshToken: 'a-jwt-shaped-string', app: 'storygeek' });

    expect(res.status).toBe(200);
    expect(mockAxiosPost).toHaveBeenCalled();
  });

  test('accepted: an empty body (refresh via cookie only) still reaches the handler', async () => {
    const res = await request(buildApp())
      .post('/api/auth/refresh')
      .send({});

    // No refreshToken in body or cookie -> the handler's own 400, proving
    // validation let the (empty, but well-formed) body through.
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('refreshToken required');
  });

  test('rejected: an unrecognized app name never reaches basegeek', async () => {
    const res = await request(buildApp())
      .post('/api/auth/refresh')
      .send({ refreshToken: 'a-jwt-shaped-string', app: 'not-a-real-app' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'app' })])
    );
    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  test('rejected: an oversized refreshToken is a 400', async () => {
    const res = await request(buildApp())
      .post('/api/auth/refresh')
      .send({ refreshToken: 'x'.repeat(4097) });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'refreshToken' })])
    );
    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  test('rejected: an unrecognized field is a 400', async () => {
    const res = await request(buildApp())
      .post('/api/auth/refresh')
      .send({ refreshToken: 'tok', evil: true });

    expect(res.status).toBe(400);
    expect(mockAxiosPost).not.toHaveBeenCalled();
  });
});

describe('400 shape', () => {
  test('matches { success:false, error: { message, code, details: [{ path, message }] } }', async () => {
    const res = await request(buildApp())
      .post('/api/auth/refresh')
      .send({ app: 'not-a-real-app' });

    expect(res.body).toMatchObject({
      success: false,
      error: {
        message: expect.any(String),
        code: 'VALIDATION_ERROR',
        details: expect.any(Array),
      },
    });
    expect(res.body.error.details[0]).toMatchObject({
      path: expect.any(String),
      message: expect.any(String),
    });
  });
});
