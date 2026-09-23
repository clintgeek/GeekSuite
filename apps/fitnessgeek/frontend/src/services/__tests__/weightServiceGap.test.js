// getWeightStats across a long gap in logging (2026-09-23): manual weigh-ins
// to Dec 2025, nothing until the scale starts in Sep 2026.
import { describe, it, expect, vi } from 'vitest';

const logs = [
  ...['2025-11-24', '2025-12-03'].map((d, i) => ({ log_date: `${d}T00:00:00.000Z`, weight_value: [300, 307.5][i] })),
  ...['2026-09-15', '2026-09-16', '2026-09-18', '2026-09-19', '2026-09-22']
    .map((d, i) => ({ log_date: `${d}T00:00:00.000Z`, weight_value: [316.8, 317.2, 321, 319.6, 318.6][i] })),
];
vi.mock('../apiService', () => ({ apiService: { get: vi.fn(async () => ({ success: true, data: logs })) } }));
const { weightService } = await import('../weightService.js');

describe('getWeightStats with a nine-month gap', () => {
  it('gives no change, a current mean, and the date the change becomes honest', async () => {
    const { data } = await weightService.getWeightStats();
    expect(data.totalChange).toBeNull();
    expect(data.reason).toBe('no_baseline');
    expect(data.currentMean).toBeCloseTo((317.2 + 321 + 319.6 + 318.6) / 4, 1);
    // 30 days after the current run began (09-15), not after the first-ever reading.
    expect(data.availableFrom).toBe('2026-10-15');
  });
});
