import { describe, it, expect } from 'vitest';
import api, { LONG_REQUEST_TIMEOUT_MS, messageFromBlobError } from '../api';

/**
 * Pins the going-over 2026-09-05 changes to the shared axios instance.
 *
 * Every page reported failures as either a hardcoded string or `err.message`,
 * which for an axios rejection is only ever "Request failed with status code
 * 400". The backend's own envelope —
 * `{ success:false, error:{ message, code, details:[{path,message}] } }` —
 * never reached the player, so a zod rejection (and the two P0s found the
 * same day, both of which presented as one) looked like a mystery outage.
 *
 * And there was no timeout at all: axios defaults to `0`, so a socket that
 * hangs rather than errors left the composer disabled forever.
 */

/** Build the axios-shaped rejection the interceptor sees. */
function rejection(data, extra = {}) {
  const err = new Error('Request failed with status code 400');
  err.response = { status: 400, data };
  return Object.assign(err, extra);
}

async function throughInterceptor(err) {
  // The instance's rejection handler is the second element of the pair.
  const handlers = api.interceptors.response.handlers.filter(Boolean);
  const onRejected = handlers[handlers.length - 1].rejected;
  try {
    await onRejected(err);
    throw new Error('interceptor should re-reject');
  } catch (e) {
    return e;
  }
}

describe('the shared axios instance', () => {
  it('has a real timeout, not axios default of forever', () => {
    expect(api.defaults.timeout).toBeGreaterThan(0);
  });

  it('exports a longer ceiling for the AI-bound calls', () => {
    expect(LONG_REQUEST_TIMEOUT_MS).toBeGreaterThan(api.defaults.timeout);
  });

  it('sends credentials (cookie SSO) and is scoped to /api', () => {
    expect(api.defaults.withCredentials).toBe(true);
    expect(api.defaults.baseURL).toBe('/api');
  });
});

describe('the error-envelope interceptor', () => {
  it("lifts the backend's message onto err.message", async () => {
    const out = await throughInterceptor(
      rejection({ success: false, error: { message: 'Validation failed', code: 'VALIDATION_ERROR' } })
    );
    expect(out.message).toBe('Validation failed');
    expect(out.serverCode).toBe('VALIDATION_ERROR');
  });

  it('appends the per-field details so the user knows which field', async () => {
    const out = await throughInterceptor(
      rejection({
        success: false,
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: [{ path: '(root)', message: "Unrecognized key(s) in object: 'userId'" }],
        },
      })
    );
    expect(out.message).toBe(
      "Validation failed — (root): Unrecognized key(s) in object: 'userId'"
    );
  });

  it('handles the controller-style { error: "<string>" } shape too', async () => {
    const out = await throughInterceptor(rejection({ error: 'Story not found' }));
    expect(out.message).toBe('Story not found');
  });

  it('names a timeout for what it is', async () => {
    const err = new Error('timeout of 30000ms exceeded');
    err.code = 'ECONNABORTED';
    const out = await throughInterceptor(err);
    expect(out.message).toMatch(/took too long/i);
  });

  it('leaves an unrecognised failure alone rather than inventing a message', async () => {
    const err = new Error('Network Error');
    const out = await throughInterceptor(err);
    expect(out.message).toBe('Network Error');
  });

  it('always re-rejects — it never turns a failure into a success', async () => {
    const out = await throughInterceptor(rejection({ error: { message: 'nope' } }));
    expect(out).toBeInstanceOf(Error);
  });
});

describe('messageFromBlobError — the EPUB download', () => {
  it('reads the JSON envelope out of a Blob body', async () => {
    const err = {
      message: 'Request failed with status code 500',
      response: {
        data: new Blob([JSON.stringify({ success: false, error: { message: 'Story not found' } })], {
          type: 'application/json',
        }),
      },
    };
    expect(await messageFromBlobError(err, 'EPUB export failed')).toBe('Story not found');
  });

  it('falls back when the blob is not JSON', async () => {
    const err = {
      message: 'Request failed with status code 502',
      response: { data: new Blob(['<html>gateway</html>'], { type: 'text/html' }) },
    };
    expect(await messageFromBlobError(err, 'EPUB export failed')).toBe(
      'Request failed with status code 502'
    );
  });

  it('falls back to the caller message when there is nothing at all', async () => {
    expect(await messageFromBlobError({}, 'EPUB export failed')).toBe('EPUB export failed');
  });
});
