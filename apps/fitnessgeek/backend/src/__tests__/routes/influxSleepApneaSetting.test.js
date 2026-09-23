// GET /api/influx/sleep-analysis/:date passes the user's
// health_alerts.sleep_apnea_screening setting (default ON) to the analysis.
const mod = (p) => new URL(p, import.meta.url).pathname;
import { describe, test, expect, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

let settings = {};
const analyzeSleep = jest.fn(async () => ({ available: true }));

jest.unstable_mockModule(mod('../../middleware/auth.js'), () => ({
  authenticateToken: (req, _res, next) => { req.user = { id: 'u1' }; next(); },
  optionalAuth: (_req, _res, next) => next(),
}));
jest.unstable_mockModule(mod('../../models/UserSettings.js'), () => ({
  __esModule: true, default: { getOrCreate: async () => settings },
}));
jest.unstable_mockModule(mod('../../services/sleepAnalysisService.js'), () => ({
  __esModule: true, default: { analyzeSleep },
}));
jest.unstable_mockModule(mod('../../services/influxService.js'), () => ({
  __esModule: true, default: { InfluxUnavailableError: class extends Error {} },
}));
jest.unstable_mockModule(mod('../../services/aiRecoveryService.js'), () => ({
  __esModule: true, default: {}, getRecoveryRecommendations: jest.fn(), generateRecoveryContext: jest.fn(),
}));

const { default: influxRoutes } = await import('../../routes/influxRoutes.js');
const app = express();
app.use('/api/influx', influxRoutes);

describe('sleep-analysis route and the sleep apnea setting', () => {
  test('unset -> on', async () => {
    settings = { influxEnabled: true, healthBaselines: {} };
    await request(app).get('/api/influx/sleep-analysis/2026-09-23').expect(200);
    expect(analyzeSleep.mock.calls.at(-1)[2]).toEqual({ sleepApneaAlert: true });
  });
  test('turned off -> off', async () => {
    settings = { influxEnabled: true, healthBaselines: {}, health_alerts: { sleep_apnea_screening: false } };
    await request(app).get('/api/influx/sleep-analysis/2026-09-23').expect(200);
    expect(analyzeSleep.mock.calls.at(-1)[2]).toEqual({ sleepApneaAlert: false });
  });
});
