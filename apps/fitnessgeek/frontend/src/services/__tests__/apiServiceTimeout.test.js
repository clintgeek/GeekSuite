/**
 * A request that never answers must end in words, not a spinner forever.
 *
 * The shared Apollo client only times out a call that sends
 * `context.timeoutMs`; apiService sent none, so a swallowed request never
 * settled: Today stayed on its skeleton and a Save stayed "saving".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { query, mutate } = vi.hoisted(() => ({ query: vi.fn(), mutate: vi.fn() }));
vi.mock('@geeksuite/api-client', () => ({ createApolloClient: () => ({ query, mutate }) }));

import { apiService, REQUEST_TIMEOUT_MS, SLOW_REQUEST_TIMEOUT_MS } from '../apiService.js';
import { errorMessage, TIMEOUT_MESSAGE } from '../../utils/errorMessage.js';

const never = () => new Promise(() => {});

describe('apiService deadlines', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    query.mockReset();
    mutate.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('asks the client to time every read and write out', async () => {
    query.mockResolvedValue({ data: { foodLogs: [] } });
    mutate.mockResolvedValue({ data: { deleteFoodLog: true } });
    await apiService.get('/logs?date=2026-11-27');
    await apiService.post('/weight', { weight_value: 200, log_date: '2026-11-27' });
    await apiService.put('/weight/abc', { weight_value: 201 });
    await apiService.delete('/logs/abc');
    expect(query.mock.calls[0][0].context).toEqual({ timeoutMs: REQUEST_TIMEOUT_MS });
    for (const call of mutate.mock.calls) expect(call[0].context).toEqual({ timeoutMs: REQUEST_TIMEOUT_MS });
    expect(mutate).toHaveBeenCalledTimes(3);
  });

  it('gives the AI reads longer', async () => {
    query.mockResolvedValue({ data: { coaching: null } });
    await apiService.get('/insights/coaching');
    expect(query.mock.calls[0][0].context).toEqual({ timeoutMs: SLOW_REQUEST_TIMEOUT_MS });
  });

  it('a read that never answers rejects with a timeout a person can read', async () => {
    query.mockImplementation(never);
    const settled = vi.fn();
    const pending = apiService.get('/logs?date=2026-11-27').then(
      () => settled('resolved'),
      (err) => settled(err),
    );
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 10000);
    await pending;
    const err = settled.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('TimeoutError');
    expect(errorMessage(err)).toBe(TIMEOUT_MESSAGE);
  });

  it('a save that never answers rejects too', async () => {
    mutate.mockImplementation(never);
    const settled = vi.fn();
    apiService.post('/blood-pressure', { systolic: 120, diastolic: 80 }).then(() => settled('resolved'), settled);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 10000);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(settled.mock.calls[0][0]?.name).toBe('TimeoutError');
  });

  it('leaves no timer behind when the answer arrives', async () => {
    query.mockResolvedValue({ data: { foodLogs: [] } });
    await apiService.get('/logs?date=2026-11-27');
    expect(vi.getTimerCount()).toBe(0);
  });
});
