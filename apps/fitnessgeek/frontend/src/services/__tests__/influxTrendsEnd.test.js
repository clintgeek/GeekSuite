/**
 * The trends window ends on the BROWSER's today. Without an `end` the server
 * used its own (UTC) today: tomorrow, all evening, in US time zones.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../restClient.js', () => ({ restClient: { get } }));

const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => { process.env.TZ = 'America/Chicago'; });
afterAll(() => { process.env.TZ = ORIGINAL_TZ; });
afterEach(() => { vi.useRealTimers(); get.mockReset(); });

import { influxService } from '../influxService.js';

describe('influxService.getTrends', () => {
  it('sends the local day as `end` when the caller gives none', async () => {
    vi.useFakeTimers();
    // 8:30pm Central on Nov 27 is already Nov 28 in UTC.
    vi.setSystemTime(new Date('2026-11-28T02:30:00Z'));
    get.mockResolvedValue({ data: { days: [] } });
    await influxService.getTrends({ days: 30 });
    expect(get).toHaveBeenCalledWith('/influx/trends?days=30&end=2026-11-27');
  });

  it('keeps an `end` the caller chose', async () => {
    get.mockResolvedValue({ data: { days: [] } });
    await influxService.getTrends({ days: 7, end: '2026-10-01' });
    expect(get).toHaveBeenCalledWith('/influx/trends?days=7&end=2026-10-01');
  });
});
