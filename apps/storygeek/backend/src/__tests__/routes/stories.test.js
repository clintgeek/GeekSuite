// Ownership tests for apps/storygeek/backend's story routes/controller.
//
// storygeek has no mongodb-memory-server dependency (unlike notegeek) and
// adding one is out of scope for this pass, so these tests run against the
// real Express router with the Story model and auth middleware replaced by
// jest module mocks — no live Mongo, no network call to basegeek.
//
// Coverage focus: the ownership boundary recently added to
// getStorySummary (isStoryOwner), and the equivalent checks in getStory,
// updateStoryStatus, deleteStory, and getUserStories.

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { buildStoryDoc } from '../utils/storyTestHelpers.js';

const OWNER = 'user-owner';
const OTHER = 'user-other';

// Resolve mocked module paths as absolute file URLs — jest's ESM module
// mocking has trouble resolving bare relative specifiers against the
// correct calling file in this vm-modules setup, so we sidestep it.
const AUTH_MIDDLEWARE_PATH = new URL('../../middleware/auth.js', import.meta.url).pathname;
const STORY_MODEL_PATH = new URL('../../models/Story.js', import.meta.url).pathname;

// Replace the real auth middleware (which calls out to basegeek) with a
// test double: the caller identifies as `x-test-user`, or is unauthenticated
// if the header is absent.
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

// Replace the Mongoose Story model with plain jest mocks.
const mockStory = {
  findById: jest.fn(),
  findByIdAndDelete: jest.fn(),
  find: jest.fn(),
};

jest.unstable_mockModule(STORY_MODEL_PATH, () => ({
  default: mockStory,
}));

let storyRoutes;

beforeAll(async () => {
  ({ default: storyRoutes } = await import('../../routes/stories.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
});

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/stories', storyRoutes);
  return app;
}

describe('GET /api/stories/:storyId (getStory)', () => {
  test('owner can read their own story', async () => {
    const story = buildStoryDoc({ userId: OWNER });
    mockStory.findById.mockResolvedValue(story);

    const res = await request(buildApp())
      .get('/api/stories/story-1')
      .set('x-test-user', OWNER);

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(OWNER);
  });

  test('non-owner is rejected with 403', async () => {
    const story = buildStoryDoc({ userId: OWNER });
    mockStory.findById.mockResolvedValue(story);

    const res = await request(buildApp())
      .get('/api/stories/story-1')
      .set('x-test-user', OTHER);

    expect(res.status).toBe(403);
  });

  test('unknown story yields 404', async () => {
    mockStory.findById.mockResolvedValue(null);

    const res = await request(buildApp())
      .get('/api/stories/does-not-exist')
      .set('x-test-user', OWNER);

    expect(res.status).toBe(404);
  });

  test('unauthenticated request is rejected with 401', async () => {
    const res = await request(buildApp()).get('/api/stories/story-1');
    expect(res.status).toBe(401);
    expect(mockStory.findById).not.toHaveBeenCalled();
  });
});

describe('GET /api/stories/:storyId/summary (getStorySummary)', () => {
  // Regression coverage for the ownership hole that was just fixed here.
  test('non-owner is rejected with 403 and never sees summary content', async () => {
    const story = buildStoryDoc({ userId: OWNER });
    mockStory.findById.mockResolvedValue(story);

    const res = await request(buildApp())
      .get('/api/stories/story-1/summary')
      .set('x-test-user', OTHER);

    expect(res.status).toBe(403);
    expect(res.body.summary).toBeUndefined();
  });

  test('owner receives the summary payload', async () => {
    const story = buildStoryDoc({ userId: OWNER });
    mockStory.findById.mockResolvedValue(story);

    const res = await request(buildApp())
      .get('/api/stories/story-1/summary')
      .set('x-test-user', OWNER);

    expect(res.status).toBe(200);
    expect(res.body.title).toBe(story.title);
    expect(res.body.summary).toContain('hero began their journey');
  });

  test('unknown story yields 404', async () => {
    mockStory.findById.mockResolvedValue(null);

    const res = await request(buildApp())
      .get('/api/stories/does-not-exist/summary')
      .set('x-test-user', OWNER);

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/stories/:storyId/status (updateStoryStatus)', () => {
  test('non-owner is rejected with 403 and story is not saved', async () => {
    const story = buildStoryDoc({ userId: OWNER });
    story.save = jest.fn().mockResolvedValue(story);
    mockStory.findById.mockResolvedValue(story);

    const res = await request(buildApp())
      .patch('/api/stories/story-1/status')
      .set('x-test-user', OTHER)
      .send({ status: 'completed' });

    expect(res.status).toBe(403);
    expect(story.save).not.toHaveBeenCalled();
    expect(story.status).toBe('active');
  });

  test('owner can update status', async () => {
    const story = buildStoryDoc({ userId: OWNER });
    story.save = jest.fn().mockResolvedValue(story);
    mockStory.findById.mockResolvedValue(story);

    const res = await request(buildApp())
      .patch('/api/stories/story-1/status')
      .set('x-test-user', OWNER)
      .send({ status: 'completed' });

    expect(res.status).toBe(200);
    expect(story.save).toHaveBeenCalledTimes(1);
    expect(story.status).toBe('completed');
  });
});

describe('DELETE /api/stories/:storyId (deleteStory)', () => {
  test('non-owner is rejected with 403 and delete is never called', async () => {
    const story = buildStoryDoc({ userId: OWNER });
    mockStory.findById.mockResolvedValue(story);

    const res = await request(buildApp())
      .delete('/api/stories/story-1')
      .set('x-test-user', OTHER);

    expect(res.status).toBe(403);
    expect(mockStory.findByIdAndDelete).not.toHaveBeenCalled();
  });

  test('owner can delete their own story', async () => {
    const story = buildStoryDoc({ userId: OWNER });
    mockStory.findById.mockResolvedValue(story);
    mockStory.findByIdAndDelete.mockResolvedValue(story);

    const res = await request(buildApp())
      .delete('/api/stories/story-1')
      .set('x-test-user', OWNER);

    expect(res.status).toBe(200);
    expect(mockStory.findByIdAndDelete).toHaveBeenCalledWith('story-1');
  });
});

describe('GET /api/stories/user/:userId (getUserStories)', () => {
  function mockFindChain(result) {
    const sort = jest.fn().mockResolvedValue(result);
    const select = jest.fn().mockReturnValue({ sort });
    mockStory.find.mockReturnValue({ select });
    return { select, sort };
  }

  test('cannot list another user\'s stories', async () => {
    mockFindChain([]);

    const res = await request(buildApp())
      .get(`/api/stories/user/${OTHER}`)
      .set('x-test-user', OWNER);

    expect(res.status).toBe(403);
    expect(mockStory.find).not.toHaveBeenCalled();
  });

  test('can list own stories', async () => {
    const stories = [{ title: 'One' }, { title: 'Two' }];
    mockFindChain(stories);

    const res = await request(buildApp())
      .get(`/api/stories/user/${OWNER}`)
      .set('x-test-user', OWNER);

    expect(res.status).toBe(200);
    expect(mockStory.find).toHaveBeenCalledWith({ userId: OWNER });
    expect(res.body).toEqual(stories);
  });
});
