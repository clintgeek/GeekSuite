/**
 * C2: describe requests carry an `Idempotency-Key`. A describe that times out
 * in the browser can still finish on the server; the retry sends the same key
 * and the server hands back its first answer instead of logging it again.
 */
import { describe, it, expect, vi } from 'vitest';

const post = vi.fn().mockResolvedValue({ data: { data: { logged: [] } } });
const get = vi.fn().mockResolvedValue({ data: { success: true, data: [] } });
vi.mock('../restClient.js', () => ({ restClient: { post: (...a) => post(...a), get: (...a) => get(...a) } }));
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

/** CONTRACTS-DONE C6: saved meals in suggest are opt-in, so only this bundle asks. */
describe('foodService.suggest', () => {
  it('asks for saved meals with meals=1 when told to', async () => {
    await foodService.suggest('quesa', { limit: 15, meals: true });
    expect(get).toHaveBeenLastCalledWith('/foods/suggest', expect.objectContaining({ params: { q: 'quesa', limit: 15, meals: 1 } }));
  });

  it('and not otherwise', async () => {
    await foodService.suggest('quesa');
    expect(get.mock.calls.at(-1)[1].params).toEqual({ q: 'quesa', limit: 15 });
  });
});
