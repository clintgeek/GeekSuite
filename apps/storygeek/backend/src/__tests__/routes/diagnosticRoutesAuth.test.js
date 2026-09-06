// Pins the going-over 2026-09-05 fix in routes/stories.js.
//
// `GET /api/stories/test-ai` and `GET /api/stories/test-debug` were mounted
// ABOVE `router.use(authenticateToken)`, so both were open to anyone who
// could reach the host. `/test-ai` fires a real GM call at basegeek, and
// `/test-debug` builds a full turn context and fires another — free AI spend
// on tap for an anonymous caller, at whatever rate the 100-per-15-minutes
// app limiter allows. `/test-debug` also answered failures with a stack
// trace, and ran against a hardcoded story id belonging to whoever owned
// `6892311348766ff4a2c3c6c1`.
//
// Same technique as crossUserOwnership.test.js: the real router, with
// `middleware/auth.js`, the `Story` model and `aiService` replaced by test
// doubles. No live Mongo, no network call to basegeek or any AI provider —
// which is also what proves the point: if the gate regresses, the AI double
// records a call that should never have happened.

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { buildStoryDoc } from '../utils/storyTestHelpers.js';

const OWNER = 'user-owner';

const AUTH_MIDDLEWARE_PATH = new URL('../../middleware/auth.js', import.meta.url).pathname;
const STORY_MODEL_PATH = new URL('../../models/Story.js', import.meta.url).pathname;
const AI_SERVICE_PATH = new URL('../../services/aiService.js', import.meta.url).pathname;
const CONTEXT_SERVICE_PATH = new URL('../../services/contextService.js', import.meta.url).pathname;

jest.unstable_mockModule(AUTH_MIDDLEWARE_PATH, () => ({
  authenticateToken: (req, res, next) => {
    const userId = req.header('x-test-user');
    if (!userId) {
      return res.status(401).json({ error: 'User authentication required' });
    }
    req.user = { _id: userId, id: userId, userId };
    next();
  },
}));

const mockStory = {
  findById: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  findByIdAndDelete: jest.fn(),
};
jest.unstable_mockModule(STORY_MODEL_PATH, () => ({ default: mockStory }));

const mockGenerate = jest.fn();
jest.unstable_mockModule(AI_SERVICE_PATH, () => ({
  default: { generateStoryResponse: mockGenerate },
}));

const mockBuildTurnContext = jest.fn();
jest.unstable_mockModule(CONTEXT_SERVICE_PATH, () => ({
  default: { buildTurnContext: mockBuildTurnContext },
}));

let storyRoutes;

beforeAll(async () => {
  ({ default: storyRoutes } = await import('../../routes/stories.js'));
});

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/stories', storyRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGenerate.mockResolvedValue({ content: 'once upon a time' });
  mockBuildTurnContext.mockResolvedValue({ prompt: 'context', turnContext: {} });
  // findOne(...).sort(...) — the chainable shape testEndpoint uses.
  mockStory.findOne.mockReturnValue({
    sort: jest.fn().mockResolvedValue(buildStoryDoc({ userId: OWNER })),
  });
});

describe('the diagnostic routes are behind auth', () => {
  test('GET /test-ai 401s an anonymous caller and spends no AI', async () => {
    const res = await request(buildApp()).get('/api/stories/test-ai');
    expect(res.status).toBe(401);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  test('GET /test-debug 401s an anonymous caller and spends no AI', async () => {
    const res = await request(buildApp()).get('/api/stories/test-debug');
    expect(res.status).toBe(401);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockBuildTurnContext).not.toHaveBeenCalled();
  });

  test('GET /test-ai still works for an authenticated caller', async () => {
    const res = await request(buildApp())
      .get('/api/stories/test-ai')
      .set('x-test-user', OWNER);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('AI Test Successful');
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });
});

describe('GET /test-debug runs against the caller, not a hardcoded id', () => {
  test('uses the caller own newest story', async () => {
    const res = await request(buildApp())
      .get('/api/stories/test-debug')
      .set('x-test-user', OWNER);
    expect(res.status).toBe(200);
    expect(mockStory.findOne).toHaveBeenCalledWith({ userId: OWNER });
    expect(mockStory.findById).not.toHaveBeenCalled();
  });

  test('404s with no story rather than blowing up inside the context builder', async () => {
    mockStory.findOne.mockReturnValue({ sort: jest.fn().mockResolvedValue(null) });
    const res = await request(buildApp())
      .get('/api/stories/test-debug')
      .set('x-test-user', OWNER);
    expect(res.status).toBe(404);
    expect(res.body.storyFound).toBe(false);
    expect(mockBuildTurnContext).not.toHaveBeenCalled();
  });

  test('never returns a stack trace on failure', async () => {
    mockBuildTurnContext.mockRejectedValue(new Error('kaboom'));
    const res = await request(buildApp())
      .get('/api/stories/test-debug')
      .set('x-test-user', OWNER);
    expect(res.status).toBe(500);
    expect(res.body.stack).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.js:/);
  });
});
