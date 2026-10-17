/**
 * Scan uploads use raw fetch (no apiService), so they used to skip the
 * suite's token refresh and show raw text on a 401 (review P2). Now a 401
 * gets one refresh-and-retry, and a second 401 says "Please sign in again".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const refreshSession = vi.fn();
vi.mock('@geeksuite/auth', () => ({
  csrfHeaders: () => ({ 'X-CSRF-Token': 't' }),
  refreshSession: (...a) => refreshSession(...a),
}));

const { uploadBodyCompFile, extractBodyCompUpload } = await import('../bodyCompUploadService.js');
const { errorMessage } = await import('../../utils/errorMessage.js');

const res = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const file = new File(['x'], 'scan.png', { type: 'image/png' });

beforeEach(() => {
  refreshSession.mockReset();
  global.fetch = vi.fn();
});

describe('scan uploads and an expired sign-in', () => {
  it('a 401 refreshes once and retries, and the retry wins', async () => {
    refreshSession.mockResolvedValue({});
    fetch.mockResolvedValueOnce(res(401, { success: false, error: { message: 'Unauthorized' } }))
      .mockResolvedValueOnce(res(200, { success: true, data: { id: 'u1' } }));
    await expect(uploadBodyCompFile(file)).resolves.toEqual({ id: 'u1' });
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('a refresh that fails says "You’re signed out. Sign in again.", never the raw text', async () => {
    refreshSession.mockRejectedValue(Object.assign(new Error('Token refresh failed'), { status: 401 }));
    fetch.mockResolvedValue(res(401, { success: false, error: { message: 'jwt expired' } }));
    const err = await extractBodyCompUpload('u1').catch((e) => e);
    expect(err.message).toBe('You’re signed out. Sign in again.');
    expect(errorMessage(err, 'x')).toBe('You’re signed out. Sign in again.');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('a 502 during a restart reads as a restart', async () => {
    fetch.mockResolvedValue(res(502, null));
    const err = await uploadBodyCompFile(file).catch((e) => e);
    expect(errorMessage(err, 'x')).toBe('FitnessGeek is restarting. Try again in a moment.');
    expect(refreshSession).not.toHaveBeenCalled();
  });
});
