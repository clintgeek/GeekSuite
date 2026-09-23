/**
 * The dashboard's Weight stat, on the smoothing rule (FITNESSGEEK_BODY_DATA_PLAN §0).
 *
 * It used to subtract the first raw reading in the window from the last one,
 * so a single water-heavy morning at either end became the month's "change".
 * These pin: 7-day trailing mean vs 7-day trailing mean ~30 days earlier; no
 * number at all when there isn't the span (and when it will exist instead).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../apiService', () => ({ apiService: { get: vi.fn() } }));

const { apiService } = await import('../apiService');
const { weightService } = await import('../weightService.js');

const DAY = 24 * 60 * 60 * 1000;
const day = (n) => new Date(Date.UTC(2026, 7, 1) + n * DAY).toISOString(); // day 0 = 2026-08-01
const logs = (entries) => entries.map(([n, w], i) => ({ id: String(i), log_date: day(n), weight_value: w }));

describe('weightService.getWeightStats', () => {
  beforeEach(() => vi.clearAllMocks());

  it('compares 7-day means, not the first and last raw readings', async () => {
    // Baseline week (days 0-6) averages 300; the week ending day 36 averages
    // 296. The first reading is a low outlier (297) and the last a water-heavy
    // high one (299) — first-vs-last raw would say +2.0 lb.
    apiService.get.mockResolvedValue({
      data: logs([
        [0, 297], [2, 301], [4, 301], [6, 301],
        [30, 295], [32, 295], [34, 295], [36, 299],
      ]),
    });
    const { data } = await weightService.getWeightStats();
    // day 36 window (30..36): mean(295,295,295,299) = 296
    // baseline = last reading on/before day 6: mean(297,301,301,301) = 300
    expect(data.totalChange).toBe(-4);
    expect(data.currentMean).toBe(296);
    expect(data.referenceWeight).toBe(300);
    expect(data.referenceDate).toBe('2026-08-07');
    expect(data.latestWeight).toBe(299);
    expect(data.periodDays).toBe(30);
    expect(data.reason).toBeNull();
  });

  it('returns no number, and when one will exist, with under 30 days of history', async () => {
    apiService.get.mockResolvedValue({ data: logs([[0, 300], [5, 305], [20, 290]]) });
    const { data } = await weightService.getWeightStats();
    expect(data.totalChange).toBeNull();
    expect(data.reason).toBe('insufficient_span');
    expect(data.availableFrom).toBe('2026-08-31');
    expect(data.latestWeight).toBe(290);
  });

  it('refuses a baseline from a different period when the log has a gap', async () => {
    // Readings on day 0 and days 60-66: 30 days before day 66 is day 36, and
    // the nearest reading before that is 36 days earlier still.
    apiService.get.mockResolvedValue({ data: logs([[0, 320], [60, 300], [63, 300], [66, 300]]) });
    const { data } = await weightService.getWeightStats();
    expect(data.totalChange).toBeNull();
    expect(data.reason).toBe('no_baseline');
  });

  it('handles an empty log', async () => {
    apiService.get.mockResolvedValue({ data: [] });
    const { data } = await weightService.getWeightStats();
    expect(data.totalChange).toBeNull();
    expect(data.latestWeight).toBeNull();
    expect(data.reason).toBe('no_data');
  });
});
