/**
 * `/api/insights/*`: an unavailable model is a **200**, not a 500.
 *
 * Every one of these routes used to end
 * `res.status(500).json({ error: 'Failed to generate …', message: error.message })`
 * because `aiInsightsService` threw whatever `baseGeekAIService` threw, which
 * was `AI service unavailable: <axios message>`. So a busy free-tier provider
 * put a red error state and a vendor-flavoured string in front of the user on
 * the dashboard's own card.
 *
 * Insight prose has no deterministic fallback, so the friendly refusal *is*
 * the fallback: `{ ok: false, reason, message }` at HTTP 200, hoisted to the
 * top level and repeated inside `data` (the frontend unwraps `data`; the front
 * door's contract describes the top level).
 *
 * A 500 from these routes now means something genuinely broke — which the last
 * case here still pins.
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const OWNER = 'user-owner';
const mod = (p) => new URL(p, import.meta.url).pathname;

jest.unstable_mockModule(mod('../../middleware/auth.js'), () => ({
  authenticateToken: (req, res, next) => {
    const userId = req.header('x-test-user');
    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required' });
    req.user = { id: userId, _id: userId, userId };
    next();
  },
  optionalAuth: (req, res, next) => next(),
}));

const service = {
  generateMorningBrief: jest.fn(),
  generateDailySummary: jest.fn(),
  analyzeCorrelations: jest.fn(),
  generateWeeklyReport: jest.fn(),
  generateTrendWatch: jest.fn(),
  getCoachingAdvice: jest.fn(),
  chat: jest.fn(),
  buildUserContext: jest.fn(),
};

jest.unstable_mockModule(mod('../../services/aiInsightsService.js'), () => ({
  __esModule: true,
  default: service
}));

const { default: insightsRoutes } = await import('../../routes/insightsRoutes.js');

const app = express();
app.use(express.json());
app.use('/api/insights', insightsRoutes);

const refusal = (type, reason = 'unavailable') => ({
  ok: false,
  type,
  reason,
  message: "The assistant isn't available right now.",
  content: null,
  generatedAt: new Date().toISOString(),
  provenance: { source: 'none', reason, hints: [] }
});

const answer = (type, content) => ({
  ok: true,
  type,
  content,
  generatedAt: new Date().toISOString(),
  provenance: { source: 'model', provider: 'groq', model: 'llama', hints: [] }
});

beforeEach(() => {
  Object.values(service).forEach((fn) => fn.mockReset());
});

const cases = [
  ['GET', '/api/insights/morning-brief', 'generateMorningBrief', 'morning_brief'],
  ['GET', '/api/insights/daily-summary', 'generateDailySummary', 'daily_summary'],
  ['GET', '/api/insights/correlations', 'analyzeCorrelations', 'correlations'],
  ['GET', '/api/insights/weekly-report', 'generateWeeklyReport', 'weekly_report'],
  ['GET', '/api/insights/trend-watch', 'generateTrendWatch', 'trend_watch'],
  ['GET', '/api/insights/coaching', 'getCoachingAdvice', 'coaching'],
];

describe('a refusal is a 200 with the friendly sentence', () => {
  test.each(cases)('%s %s', async (_method, path, method, type) => {
    service[method].mockResolvedValue(refusal(type, 'cap'));

    const res = await request(app).get(path).set('x-test-user', OWNER);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.reason).toBe('cap');
    expect(res.body.message).toBe("The assistant isn't available right now.");
    // Same trio inside `data`, which is what the frontend client unwraps.
    expect(res.body.data.ok).toBe(false);
    expect(res.body.data.message).toBe("The assistant isn't available right now.");
    // Nothing about a provider, a status code or a vendor reaches the user.
    expect(JSON.stringify(res.body)).not.toMatch(/axios|429|upstream|groq/i);
  });
});

describe('an answer is a 200 with content', () => {
  test.each(cases)('%s %s', async (_method, path, method, type) => {
    service[method].mockResolvedValue(answer(type, 'two paragraphs of prose'));

    const res = await request(app).get(path).set('x-test-user', OWNER);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.reason).toBeNull();
    expect(res.body.data.content).toBe('two paragraphs of prose');
  });
});

describe('POST /api/insights/chat', () => {
  test('a refusal is a 200 the thread can render in place', async () => {
    service.chat.mockResolvedValue(refusal('chat', 'timeout'));

    const res = await request(app)
      .post('/api/insights/chat')
      .set('x-test-user', OWNER)
      .send({ message: 'how did I do this week?' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.reason).toBe('timeout');
    expect(res.body.message).toBe("The assistant isn't available right now.");
  });

  test('the message is passed through with the history, and no user token', async () => {
    service.chat.mockResolvedValue(answer('chat', 'you did fine'));

    await request(app)
      .post('/api/insights/chat')
      .set('x-test-user', OWNER)
      .send({ message: 'hi', history: [{ role: 'user', content: 'earlier' }] });

    expect(service.chat).toHaveBeenCalledWith(OWNER, 'hi', [{ role: 'user', content: 'earlier' }]);
  });

  test('a missing message is still a 400', async () => {
    const res = await request(app)
      .post('/api/insights/chat')
      .set('x-test-user', OWNER)
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('a real failure is still a 500', () => {
  test('a broken context build, not an unavailable model', async () => {
    service.generateMorningBrief.mockRejectedValue(new Error('FoodLog.find is not a function'));

    const res = await request(app).get('/api/insights/morning-brief').set('x-test-user', OWNER);

    expect(res.status).toBe(500);
    // The cause goes to the log, not the body.
    expect(JSON.stringify(res.body)).not.toContain('FoodLog.find');
  });
});

describe('GET /api/insights/context', () => {
  test('never involves a model, so it has no ok flag to answer with', async () => {
    service.buildUserContext.mockResolvedValue({ dateRange: { days: 7 } });
    const res = await request(app).get('/api/insights/context?days=7').set('x-test-user', OWNER);
    expect(res.status).toBe(200);
    expect(res.body.data.dateRange.days).toBe(7);
  });
});
