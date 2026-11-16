/**
 * SUITE_REVIEW_2026-11 FitnessGeek #1 — Home's weight stat reads a window,
 * not every weigh-in ever, and gets the SAME answer as from every row.
 *
 * The 30-day change compares 7-day means, so it reads ~44 days. The service
 * asks for the last ~74 and only asks for everything when the window cannot
 * be trusted: no rows, too short a span (older rows may sit before it), or a
 * latest reading so old the baseline week falls outside it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../apiService', () => ({ apiService: { get: vi.fn() } }));
const { apiService } = await import('../apiService');
const { weightService } = await import('../weightService.js');

const DAY = 24 * 60 * 60 * 1000;
const TODAY = '2026-11-15';
const T0 = Date.parse(`${TODAY}T00:00:00Z`);
const daysAgo = (n) => new Date(T0 - n * DAY).toISOString();

// The server: newest first, honouring ?startDate= like the gateway does.
const serve = (rows) => {
  apiService.get.mockImplementation(async (url) => {
    const since = new URLSearchParams(url.split('?')[1] || '').get('startDate');
    const from = since ? Date.parse(`${since}T00:00:00Z`) : -Infinity;
    return { success: true, data: rows.filter((r) => Date.parse(r.log_date) >= from) };
  });
};
const history = (fromDaysAgo, toDaysAgo, step = 1, w = (n) => 250 - n / 7) => {
  const rows = [];
  for (let n = toDaysAgo; n <= fromDaysAgo; n += step) rows.push({ id: String(n), log_date: daysAgo(n), weight_value: Math.round(w(n) * 10) / 10 });
  return rows;
};
const fullAnswer = async () => (await weightService.computeWeightStats()).data;

beforeEach(() => vi.clearAllMocks());

describe('getWeightStats reads a window', () => {
  it('a long daily history: one bounded read, same answer as every row', async () => {
    serve(history(400, 0));
    const { data } = await weightService.getWeightStats({ today: TODAY });
    expect(apiService.get).toHaveBeenCalledTimes(1);
    expect(apiService.get.mock.calls[0][0]).toBe('/weight?startDate=2026-09-02');
    expect(data.totalChange).not.toBeNull();
    expect(data).toEqual(await fullAnswer());
  });

  it('a gap before the baseline: same no_baseline answer, still bounded', async () => {
    serve([...history(400, 70), ...history(10, 0)]);
    const { data } = await weightService.getWeightStats({ today: TODAY });
    expect(apiService.get).toHaveBeenCalledTimes(1);
    expect(data.reason).toBe('no_baseline');
    expect(data).toEqual(await fullAnswer());
  });

  it('nothing in the window: asks for everything (old weigh-ins still count)', async () => {
    serve(history(400, 200));
    const { data } = await weightService.getWeightStats({ today: TODAY });
    expect(apiService.get).toHaveBeenCalledTimes(2);
    expect(apiService.get.mock.calls[1][0]).toBe('/weight');
    expect(data.latestWeight).not.toBeNull();
    expect(data).toEqual(await fullAnswer());
  });

  it('a latest reading too old for the window to hold its baseline: asks for everything', async () => {
    serve(history(400, 60));
    const { data } = await weightService.getWeightStats({ today: TODAY });
    expect(apiService.get).toHaveBeenCalledTimes(2);
    expect(data.totalChange).not.toBeNull();
    expect(data).toEqual(await fullAnswer());
  });

  it('a short span in the window: asks for everything before saying "not enough history"', async () => {
    serve([...history(400, 200), ...history(20, 0)]);
    const { data } = await weightService.getWeightStats({ today: TODAY });
    expect(apiService.get).toHaveBeenCalledTimes(2);
    expect(data).toEqual(await fullAnswer());
    // From the window alone this would be insufficient_span ("not enough
    // history yet"); with every row it is the truth — a gap.
    expect(data.reason).toBe('no_baseline');
  });
});
