/**
 * C2: describe requests carry an `Idempotency-Key`. A describe that times out
 * in the browser can still finish on the server; the retry sends the same key
 * and the server hands back its first answer instead of logging it again.
 */
import { describe, it, expect, vi } from 'vitest';

const post = vi.fn().mockResolvedValue({ data: { data: { logged: [] } } });
vi.mock('../restClient.js', () => ({ restClient: { post: (...a) => post(...a), get: vi.fn() } }));
vi.mock('../apiService.js', () => ({ apiService: {} }));

const { foodService } = await import('../foodService.js');

describe('foodService.describe', () => {
  it('sends the key as the Idempotency-Key header', async () => {
    await foodService.describe('two eggs', { date: '2026-10-16', hour: 8, idempotencyKey: 'abc-123' });
    const [, body, config] = post.mock.calls[0];
    expect(body).toMatchObject({ text: 'two eggs', date: '2026-10-16', hour: 8 });
    expect(config.headers).toEqual({ 'Idempotency-Key': 'abc-123' });
  });
});
