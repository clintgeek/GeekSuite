/**
 * POST /api/auth/refresh forwards basegeek's own cookie, `geek_refresh_token`.
 * It used to prefer a legacy `geek_refresh` cookie; a browser still holding
 * one replayed a stale token on every refresh, basegeek detected rotation
 * reuse and revoked the session, and FitnessGeek bounced to sign-in even
 * right after logging in (2026-10-17).
 */
import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';

const axios = jest.fn();
axios.get = jest.fn();
axios.post = jest.fn();
axios.default = axios;
jest.unstable_mockModule('axios', () => axios);
jest.mock('axios', () => axios);

const { default: app } = await import('../app.js');

beforeEach(() => {
  axios.post.mockReset();
  axios.post.mockResolvedValue({ status: 200, data: { success: true, token: 'new-access' }, headers: {} });
});

describe('POST /api/auth/refresh', () => {
  test('sends geek_refresh_token, never a legacy geek_refresh cookie', async () => {
    await request(app)
      .post('/api/auth/refresh')
      .set('Origin', 'https://fitnessgeek.clintgeek.com')
      .set('Cookie', ['geek_refresh=STALE-OLD', 'geek_refresh_token=CURRENT'])
      .send({});
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post.mock.calls[0][1].refreshToken).toBe('CURRENT');
  });

  test('expires a leftover geek_refresh cookie so it is never read again', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Origin', 'https://fitnessgeek.clintgeek.com')
      .set('Cookie', ['geek_refresh=STALE-OLD', 'geek_refresh_token=CURRENT'])
      .send({});
    const cookies = [].concat(res.headers['set-cookie'] || []);
    expect(cookies.some((c) => /^geek_refresh=;/.test(c) && /Max-Age=0/.test(c))).toBe(true);
  });

  test('with only the legacy cookie, it is not forwarded', async () => {
    await request(app)
      .post('/api/auth/refresh')
      .set('Origin', 'https://fitnessgeek.clintgeek.com')
      .set('Cookie', ['geek_refresh=STALE-OLD'])
      .send({});
    const sent = axios.post.mock.calls[0]?.[1] || {};
    expect(sent.refreshToken).toBeUndefined();
  });
});
