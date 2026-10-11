/**
 * POST /api/discover goes through NewsGeek's own axios instance, which carries
 * the suite session the same way the basegeek instance does: cookies
 * (withCredentials) and the double-submit X-CSRF-Token read from geek_csrf.
 */
import { newsApi } from '../../bootstrapUser';
import { OFFLINE_LINE, RATE_LIMITED_LINE, SNAG_LINE, discoverErrorFrom, discoverSource } from '../../api/discover';

describe('discoverSource', () => {
  let adapter;
  const saved = newsApi.defaults.adapter;
  beforeEach(() => {
    document.cookie = 'geek_csrf=tok-123; path=/';
    adapter = vi.fn(async (config) => ({ data: { ok: true, feeds: [] }, status: 200, statusText: 'OK', headers: {}, config }));
    newsApi.defaults.adapter = adapter;
  });
  afterEach(() => {
    newsApi.defaults.adapter = saved;
    document.cookie = 'geek_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  });

  it('POSTs { url } to same-origin /api/discover with credentials and the CSRF header', async () => {
    const body = await discoverSource('https://magnoliareporter.com/');
    expect(body).toEqual({ ok: true, feeds: [] });
    const config = adapter.mock.calls[0][0];
    expect(config.method).toBe('post');
    expect(config.baseURL).toBe('/api');
    expect(config.url).toBe('/discover');
    expect(config.withCredentials).toBe(true);
    expect(JSON.parse(config.data)).toEqual({ url: 'https://magnoliareporter.com/' });
    expect(config.headers['X-CSRF-Token']).toBe('tok-123');
  });

  it('an ok:false answer resolves (it is an answer, not an error)', async () => {
    adapter.mockImplementationOnce(async (config) => ({ data: { ok: false, message: 'No feed found' }, status: 200, statusText: 'OK', headers: {}, config }));
    await expect(discoverSource('https://example.org/')).resolves.toEqual({ ok: false, message: 'No feed found' });
  });
});

describe('discoverErrorFrom', () => {
  const res = (status, data) => ({ response: { status, data } });
  it('429 or code RATE_LIMITED → the friendly line', () => {
    expect(discoverErrorFrom(res(429, {})).message).toBe(RATE_LIMITED_LINE);
    expect(discoverErrorFrom(res(400, { code: 'RATE_LIMITED', message: 'raw' })).message).toBe(RATE_LIMITED_LINE);
  });
  it('a 4xx with a message → shown as returned (the SSRF guard)', () => {
    const e = discoverErrorFrom(res(400, { code: 'UNSAFE_URL', message: 'That address isn’t on the public internet.' }));
    expect(e.message).toBe('That address isn’t on the public internet.');
    expect(e.code).toBe('UNSAFE_URL');
  });
  it('no response → offline; 5xx → snag (never a stack)', () => {
    expect(discoverErrorFrom(new Error('Network Error')).message).toBe(OFFLINE_LINE);
    expect(discoverErrorFrom(res(500, { message: 'TypeError: x is undefined' })).message).toBe(SNAG_LINE);
  });
});
