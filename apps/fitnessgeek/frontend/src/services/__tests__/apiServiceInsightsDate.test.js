/**
 * The morning brief, correlations and coaching answer about "today". The
 * gateway runs in UTC, so after 19:00 Central its today is tomorrow; these
 * calls send the browser's date (the gateway took it as an optional arg,
 * 2026-10-16).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

const query = vi.fn(() => Promise.resolve({ data: {} }));
vi.mock('@geeksuite/api-client', () => ({
  createApolloClient: () => ({ query, mutate: vi.fn() }),
}));

const { apiService } = await import('../apiService.js');

afterEach(() => { vi.useRealTimers(); query.mockClear(); });

describe('insight calls send the local date', () => {
  it.each([
    ['/insights/morning-brief', 'GetMorningBrief'],
    ['/insights/correlations', 'GetCorrelations'],
    ['/insights/coaching', 'GetCoaching'],
  ])('%s', async (path, op) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 16, 21, 30)); // 9:30 PM local
    await apiService.get(path).catch(() => {});
    const call = query.mock.calls.at(-1)[0];
    expect(call.query.definitions[0].name.value).toBe(op);
    expect(call.variables).toEqual({ date: '2026-10-16' });
  });
});
