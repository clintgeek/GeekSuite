import { describe, it, expect, afterEach, vi } from 'vitest';
import { errorMessage, OFFLINE_MESSAGE, RESTARTING_MESSAGE, TIMEOUT_MESSAGE, SIGNED_OUT_MESSAGE } from '../errorMessage.js';

afterEach(() => vi.unstubAllGlobals());

describe('errorMessage', () => {
  it('passes friendly server text through', () => {
    expect(errorMessage({ graphQLErrors: [{ message: 'Household not found' }] }, 'x')).toBe('Household not found');
    expect(errorMessage({ response: { status: 400, data: { error: { message: 'Name is required' } } } }, 'x')).toBe('Name is required');
  });

  it('never shows raw transport text', () => {
    expect(errorMessage({ message: 'Request failed with status code 502', response: { status: 502 } }, 'x')).toBe(RESTARTING_MESSAGE);
    expect(errorMessage({ message: 'Network Error', code: 'ERR_NETWORK' }, 'x')).toBe(OFFLINE_MESSAGE);
    expect(errorMessage({ message: 'timeout of 30000ms exceeded', code: 'ECONNABORTED' }, 'x')).toBe(TIMEOUT_MESSAGE);
    expect(errorMessage({ networkError: { statusCode: 401 } }, 'x')).toBe(SIGNED_OUT_MESSAGE);
    expect(errorMessage(new TypeError('Cannot read properties of undefined'), 'fallback')).toBe('fallback');
  });

  it('hides internal server text such as a Mongo duplicate key', () => {
    const err = { graphQLErrors: [{ message: 'E11000 duplicate key error collection: fitnessgeek.bloodpressures index: userId_1_measured_at_1 dup key: { userId: "6acc" }' }] };
    expect(errorMessage(err, 'Already saved')).toBe('Already saved');
  });

  it('says offline when the browser is offline', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(errorMessage({ message: 'Failed to fetch' }, 'x')).toBe(OFFLINE_MESSAGE);
  });
});
