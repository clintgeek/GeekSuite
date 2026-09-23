// GET /api/influx/trends — query validation, gating, and the influx-down
// convention (200 + available:false, as every other influx route).
const mod = (p) => new URL(p, import.meta.url).pathname;
import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

class InfluxUnavailableError extends Error {}
let settings = {};
const getDailyTrends = jest.fn(async () => ({ available: true, days: [] }));

jest.unstable_mockModule(mod('../../middleware/auth.js'), () => ({
  authenticateToken: (req, _res, next) => { req.user = { id: 'u1' }; next(); },
  optionalAuth: (_req, _res, next) => next(),
}));
jest.unstable_mockModule(mod('../../models/UserSettings.js'), () => ({
  __esModule: true, default: { getOrCreate: async () => settings },
}));
jest.unstable_mockModule(mod('../../services/sleepAnalysisService.js'), () => ({
  __esModule: true, default: { analyzeSleep: jest.fn() },
}));
jest.unstable_mockModule(mod('../../services/influxService.js'), () => ({
  __esModule: true, default: { InfluxUnavailableError, getDailyTrends },
}));
jest.unstable_mockModule(mod('../../services/aiRecoveryService.js'), () => ({
  __esModule: true, default: {}, getRecoveryRecommendations: jest.fn(), generateRecoveryContext: jest.fn(),
}));

const { default: influxRoutes } = await import('../../routes/influxRoutes.js');
const app = express();
app.use('/api/influx', influxRoutes);

beforeEach(() => {
  settings = { influxEnabled: true };
  getDailyTrends.mockReset();
  getDailyTrends.mockResolvedValue({ available: true, days: [] });
});

describe('GET /api/influx/trends', () => {
  test('passes end and days through', async () => {
    await request(app).get('/api/influx/trends?days=30&end=2026-03-10').expect(200);
    expect(getDailyTrends).toHaveBeenLastCalledWith('2026-03-10', 30);
  });

  test('days defaults to 90', async () => {
    await request(app).get('/api/influx/trends?end=2026-03-10').expect(200);
    expect(getDailyTrends).toHaveBeenLastCalledWith('2026-03-10', 90);
  });

  test('days is clamped to 1..365', async () => {
    await request(app).get('/api/influx/trends?days=0&end=2026-03-10').expect(200);
    expect(getDailyTrends).toHaveBeenLastCalledWith('2026-03-10', 1);
    await request(app).get('/api/influx/trends?days=5000&end=2026-03-10').expect(200);
    expect(getDailyTrends).toHaveBeenLastCalledWith('2026-03-10', 365);
  });

  test.each(['abc', '7.5', '-3', '', '10x'])('non-numeric days %p → 400', async (d) => {
    await request(app).get(`/api/influx/trends?days=${d}&end=2026-03-10`).expect(400);
    expect(getDailyTrends).not.toHaveBeenCalled();
  });

  test.each(['2026-3-10', '03/10/2026', '2026-02-30', '2026-13-01', 'today'])('bad end %p → 400', async (e) => {
    await request(app).get(`/api/influx/trends?end=${encodeURIComponent(e)}`).expect(400);
    expect(getDailyTrends).not.toHaveBeenCalled();
  });

  test('no end → the server UTC date (fallback)', async () => {
    const before = new Date().toISOString().slice(0, 10);
    await request(app).get('/api/influx/trends').expect(200);
    const after = new Date().toISOString().slice(0, 10);
    expect([before, after]).toContain(getDailyTrends.mock.calls.at(-1)[0]);
  });

  test('returns the service result as the body', async () => {
    getDailyTrends.mockResolvedValue({ available: true, days: [{ date: '2026-03-10' }], fitnessAge: null, activeKcal30: null });
    const res = await request(app).get('/api/influx/trends?days=1&end=2026-03-10').expect(200);
    expect(res.body.days).toEqual([{ date: '2026-03-10' }]);
  });

  test('influx not enabled for the user → 403', async () => {
    settings = { influxEnabled: false };
    await request(app).get('/api/influx/trends?end=2026-03-10').expect(403);
    expect(getDailyTrends).not.toHaveBeenCalled();
  });

  test('influx down → 200 available:false with empty days', async () => {
    getDailyTrends.mockRejectedValue(new InfluxUnavailableError('InfluxDB query failed: HTTP 503'));
    const res = await request(app).get('/api/influx/trends?end=2026-03-10').expect(200);
    expect(res.body).toMatchObject({ available: false, reason: 'influx_unavailable', days: [], fitnessAge: null, activeKcal30: null });
  });

  test('any other failure → 500', async () => {
    getDailyTrends.mockRejectedValue(new Error('boom'));
    await request(app).get('/api/influx/trends?end=2026-03-10').expect(500);
  });
});
