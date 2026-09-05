// Input-validation coverage for routes/stories.js (POST /start, POST
// /:storyId/continue, PATCH /:storyId/status, DELETE /:storyId), added as
// part of DOCS/TODO_ORDER.md #22 (storygeek slice).
//
// Hermetic, same technique as stories.test.js / crossUserOwnership.test.js:
// the real Express router runs for real, with auth, the Story model, and
// (only where a passing-body test needs to reach a 200) aiService /
// canonQueryService replaced by jest module doubles. No live Mongo, no
// network call to basegeek or any AI provider.

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { buildStoryDoc } from '../utils/storyTestHelpers.js';

const OWNER = 'user-owner';

const mod = (p) => new URL(p, import.meta.url).pathname;

jest.unstable_mockModule(mod('../../middleware/auth.js'), () => ({
  authenticateToken: (req, res, next) => {
    const userId = req.header('x-test-user');
    if (!userId) {
      return res.status(401).json({ error: 'User authentication required' });
    }
    req.user = { _id: userId, id: userId, userId };
    next();
  },
}));

// Story is used both as a constructor (`new Story({...})` in startStory) and
// via static finders (findById, findByIdAndDelete) elsewhere in the
// controller — the double needs to support both.
const mockStory = jest.fn().mockImplementation(function ctor(doc) {
  Object.assign(this, doc);
  this._id = this._id || 'new-story-id';
  this.save = jest.fn().mockResolvedValue(this);
});
mockStory.findById = jest.fn();
mockStory.findByIdAndDelete = jest.fn();

jest.unstable_mockModule(mod('../../models/Story.js'), () => ({
  default: mockStory,
}));

const mockGenerateStoryResponse = jest.fn();
jest.unstable_mockModule(mod('../../services/aiService.js'), () => ({
  default: { generateStoryResponse: mockGenerateStoryResponse, getGMConfig: jest.fn() },
}));

// continueStory routes a plain question straight to canonQueryService and
// returns before touching aiService/contextService/the state pipeline at
// all — the cheapest way to exercise a real 200 through this route without
// mocking the whole turn pipeline.
const mockIsCanonQuery = jest.fn();
const mockAnswerCanonQuery = jest.fn();
jest.unstable_mockModule(mod('../../services/canonQueryService.js'), () => ({
  default: { isCanonQuery: mockIsCanonQuery, answerCanonQuery: mockAnswerCanonQuery },
}));

const { default: Story } = await import('../../models/Story.js');
const { default: storyRoutes } = await import('../../routes/stories.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/stories', storyRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/stories/start validation', () => {
  test('accepted: a plausible prompt starts a story', async () => {
    mockGenerateStoryResponse.mockResolvedValue({ content: 'What is your character\'s name?' });

    const res = await request(buildApp())
      .post('/api/stories/start')
      .set('x-test-user', OWNER)
      .send({ prompt: 'A lone knight rides into a cursed forest.', title: 'The Cursed Forest', genre: 'Fantasy' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('setup');
    expect(mockGenerateStoryResponse).toHaveBeenCalled();
  });

  test('rejected: missing prompt never reaches the controller', async () => {
    const res = await request(buildApp())
      .post('/api/stories/start')
      .set('x-test-user', OWNER)
      .send({ title: 'No Prompt Here' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'prompt' })])
    );
    expect(mockGenerateStoryResponse).not.toHaveBeenCalled();
  });

  test('rejected: title over 200 chars is a 400, not a truncated save', async () => {
    const res = await request(buildApp())
      .post('/api/stories/start')
      .set('x-test-user', OWNER)
      .send({ prompt: 'A valid prompt.', title: 'x'.repeat(201) });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'title' })])
    );
  });

  test('rejected: an unrecognized field is now a 400 (previously silently ignored)', async () => {
    const res = await request(buildApp())
      .post('/api/stories/start')
      .set('x-test-user', OWNER)
      .send({ prompt: 'A valid prompt.', notAField: true });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining('notAField') })])
    );
  });
});

describe('POST /api/stories/:storyId/continue validation', () => {
  test('accepted: a plausible userInput reaches the controller', async () => {
    const story = buildStoryDoc({ userId: OWNER, status: 'active' });
    mockStory.findById.mockResolvedValue(story);
    mockIsCanonQuery.mockReturnValue(true);
    mockAnswerCanonQuery.mockResolvedValue({ type: 'canon_answer', message: 'You know the forest is cursed.' });

    const res = await request(buildApp())
      .post('/api/stories/story-1/continue')
      .set('x-test-user', OWNER)
      .send({ userInput: 'What do I know about the forest?' });

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('canon_answer');
  });

  test('rejected: missing userInput never reaches the controller (previously a 500 — see stories.js)', async () => {
    const res = await request(buildApp())
      .post('/api/stories/story-1/continue')
      .set('x-test-user', OWNER)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'userInput' })])
    );
    expect(mockStory.findById).not.toHaveBeenCalled();
  });

  test('rejected: userInput over 20000 chars is a 400', async () => {
    const res = await request(buildApp())
      .post('/api/stories/story-1/continue')
      .set('x-test-user', OWNER)
      .send({ userInput: 'x'.repeat(20001) });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'userInput' })])
    );
  });

  test('rejected: an unrecognized field is a 400', async () => {
    const res = await request(buildApp())
      .post('/api/stories/story-1/continue')
      .set('x-test-user', OWNER)
      .send({ userInput: 'hello', notAField: true });

    expect(res.status).toBe(400);
  });

  test('rejected: an oversized storyId param is a 400 before any lookup', async () => {
    const res = await request(buildApp())
      .post(`/api/stories/${'s'.repeat(65)}/continue`)
      .set('x-test-user', OWNER)
      .send({ userInput: 'hello' });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'storyId' })])
    );
    expect(mockStory.findById).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/stories/:storyId/status validation', () => {
  test('accepted: a valid status is applied', async () => {
    const story = buildStoryDoc({ userId: OWNER });
    mockStory.findById.mockResolvedValue(story);

    const res = await request(buildApp())
      .patch('/api/stories/story-1/status')
      .set('x-test-user', OWNER)
      .send({ status: 'completed' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(story.status).toBe('completed');
  });

  test('rejected: an unrecognized status is a 400, not a Mongoose ValidationError', async () => {
    const res = await request(buildApp())
      .patch('/api/stories/story-1/status')
      .set('x-test-user', OWNER)
      .send({ status: 'not-a-real-status' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'status' })])
    );
    expect(mockStory.findById).not.toHaveBeenCalled();
  });

  test('rejected: an unrecognized field is a 400', async () => {
    const res = await request(buildApp())
      .patch('/api/stories/story-1/status')
      .set('x-test-user', OWNER)
      .send({ status: 'completed', force: true });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/stories/:storyId validation', () => {
  test('accepted: a well-formed storyId reaches the controller', async () => {
    const story = buildStoryDoc({ userId: OWNER });
    mockStory.findById.mockResolvedValue(story);
    mockStory.findByIdAndDelete.mockResolvedValue(story);

    const res = await request(buildApp())
      .delete('/api/stories/story-1')
      .set('x-test-user', OWNER);

    expect(res.status).toBe(200);
    expect(mockStory.findByIdAndDelete).toHaveBeenCalledWith('story-1');
  });

  test('rejected: an oversized storyId is a 400 before any lookup', async () => {
    const res = await request(buildApp())
      .delete(`/api/stories/${'s'.repeat(65)}`)
      .set('x-test-user', OWNER);

    expect(res.status).toBe(400);
    expect(mockStory.findById).not.toHaveBeenCalled();
  });
});

describe('400 shape', () => {
  test('matches { success:false, error: { message, code, details: [{ path, message }] } }', async () => {
    const res = await request(buildApp())
      .post('/api/stories/start')
      .set('x-test-user', OWNER)
      .send({});

    expect(res.body).toMatchObject({
      success: false,
      error: {
        message: expect.any(String),
        code: 'VALIDATION_ERROR',
        details: expect.any(Array),
      },
    });
    expect(res.body.error.details[0]).toMatchObject({
      path: expect.any(String),
      message: expect.any(String),
    });
  });
});
