import { describe, test, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { installCsrfHeal, isCsrfFailure, CSRF_RELOAD_FLAG_KEY } from '../../api';

function instanceWithAdapter(responses) {
  let i = 0;
  const calls = [];
  const inst = axios.create({ adapter: async (config) => {
    calls.push(config);
    const r = responses[Math.min(i++, responses.length - 1)];
    if (r.status >= 400) {
      const err = new axios.AxiosError('fail', 'ERR_BAD_REQUEST', config, null, { status: r.status, data: r.data, headers: {}, config });
      throw err;
    }
    return { status: r.status, data: r.data, headers: {}, config };
  } });
  return { inst, calls };
}

beforeEach(() => {
  document.cookie = 'geek_csrf=tok-live; path=/';
  sessionStorage.removeItem(CSRF_RELOAD_FLAG_KEY);
});

describe('console CSRF self-heal', () => {
  test('isCsrfFailure recognises the guard shapes', () => {
    expect(isCsrfFailure(403, { error: 'csrf_token_missing' })).toBe(true);
    expect(isCsrfFailure(403, { code: 'csrf_token_invalid' })).toBe(true);
    expect(isCsrfFailure(403, { error: 'forbidden' })).toBe(false);
    expect(isCsrfFailure(401, { error: 'csrf_token_missing' })).toBe(false);
  });

  test('a 403 csrf_token_missing is retried once with the live cookie value', async () => {
    const { inst, calls } = instanceWithAdapter([{ status: 403, data: { error: 'csrf_token_missing' } }, { status: 200, data: { ok: true } }]);
    const reloadOnce = vi.fn(() => true);
    installCsrfHeal(inst, { reloadOnce });
    const res = await inst.post('/auth/login', { a: 1 });
    expect(res.data).toEqual({ ok: true });
    expect(calls).toHaveLength(2);
    expect(calls[1].headers['X-CSRF-Token'] ?? calls[1].headers.get?.('X-CSRF-Token')).toBe('tok-live');
    expect(reloadOnce).not.toHaveBeenCalled();
  });

  test('a second failure reloads once per session and never resolves', async () => {
    const { inst } = instanceWithAdapter([{ status: 403, data: { error: 'csrf_token_missing' } }]);
    const reload = vi.fn();
    const reloadOnce = vi.fn(() => { if (sessionStorage.getItem(CSRF_RELOAD_FLAG_KEY)) return false; sessionStorage.setItem(CSRF_RELOAD_FLAG_KEY, '1'); reload(); return true; });
    installCsrfHeal(inst, { reloadOnce });
    const pending = inst.post('/auth/login', {});
    const winner = await Promise.race([pending.then(() => 'resolved', () => 'rejected'), new Promise((r) => setTimeout(() => r('pending'), 50))]);
    expect(winner).toBe('pending');
    expect(reload).toHaveBeenCalledTimes(1);
    // second time in the same session: no reload, the error surfaces
    const { inst: inst2 } = instanceWithAdapter([{ status: 403, data: { error: 'csrf_token_missing' } }]);
    installCsrfHeal(inst2, { reloadOnce });
    await expect(inst2.post('/auth/login', {})).rejects.toMatchObject({ response: { status: 403 } });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test('non-CSRF errors pass straight through', async () => {
    const { inst, calls } = instanceWithAdapter([{ status: 401, data: { message: 'bad password' } }]);
    installCsrfHeal(inst, { reloadOnce: vi.fn() });
    await expect(inst.post('/auth/login', {})).rejects.toMatchObject({ response: { status: 401 } });
    expect(calls).toHaveLength(1);
  });
});
