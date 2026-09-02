// Cross-user data-scoping tests for apps/storygeek/backend, extending the
// ownership coverage in ./stories.test.js to the routes it doesn't touch:
// continueStory, the characters resource, and the export/bookify resource.
//
// Same technique as stories.test.js: the real Express routers run for
// real, with `middleware/auth.js` replaced by a test double (caller
// identifies via the `x-test-user` header) and the Mongoose `Story` model
// replaced by plain jest mocks. No live Mongo, no network call to
// basegeek or any AI provider.
//
// Two of the describe blocks below assert the CODE'S ACTUAL CONTRACT,
// which is a security finding, not the desired behavior:
//   - the characters resource has no ownership check at all
//   - the export/bookify resource has no ownership check at all
// Both are reachable by any authenticated user who knows/guesses a
// storyId belonging to someone else. See the final report for detail;
// per task instructions these are reported, not silently fixed here.

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { buildStoryDoc } from '../utils/storyTestHelpers.js';

const OWNER = 'user-owner';
const OTHER = 'user-other';

const AUTH_MIDDLEWARE_PATH = new URL('../../middleware/auth.js', import.meta.url).pathname;
const STORY_MODEL_PATH = new URL('../../models/Story.js', import.meta.url).pathname;
const BOOK_SERVICE_PATH = new URL('../../services/bookService.js', import.meta.url).pathname;

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
  findByIdAndDelete: jest.fn(),
  find: jest.fn(),
};

jest.unstable_mockModule(STORY_MODEL_PATH, () => ({
  default: mockStory,
}));

const mockBookify = jest.fn();
jest.unstable_mockModule(BOOK_SERVICE_PATH, () => ({
  default: { bookify: mockBookify },
}));

let storyRoutes;
let characterRoutes;
let exportRoutes;

beforeAll(async () => {
  ({ default: storyRoutes } = await import('../../routes/stories.js'));
  ({ default: characterRoutes } = await import('../../routes/characters.js'));
  ({ default: exportRoutes } = await import('../../routes/export.js'));
});

beforeEach(() => {
  jest.clearAllMocks();
});

function buildApp(mountPath, router) {
  const app = express();
  app.use(express.json());
  app.use(mountPath, router);
  return app;
}

describe('POST /api/stories/:storyId/continue (continueStory) ownership', () => {
  function app() {
    return buildApp('/api/stories', storyRoutes);
  }

  test('non-owner is rejected with 403 before touching userInput', async () => {
    const story = buildStoryDoc({ userId: OWNER });
    story.save = jest.fn();
    mockStory.findById.mockResolvedValue(story);

    const res = await request(app())
      .post('/api/stories/story-1/continue')
      .set('x-test-user', OTHER)
      .send({ userInput: 'I open the door' });

    expect(res.status).toBe(403);
    expect(story.save).not.toHaveBeenCalled();
  });

  test('unknown story yields 404', async () => {
    mockStory.findById.mockResolvedValue(null);

    const res = await request(app())
      .post('/api/stories/does-not-exist/continue')
      .set('x-test-user', OWNER)
      .send({ userInput: 'hello' });

    expect(res.status).toBe(404);
  });

  test('unauthenticated request is rejected with 401', async () => {
    const res = await request(app())
      .post('/api/stories/story-1/continue')
      .send({ userInput: 'hello' });

    expect(res.status).toBe(401);
    expect(mockStory.findById).not.toHaveBeenCalled();
  });
});

describe('GET /api/stories/user/:userId — list scoping', () => {
  function app() {
    return buildApp('/api/stories', storyRoutes);
  }

  test("A's story list excludes B's stories", async () => {
    // The route always queries by the *authenticated* userId, so a
    // same-shaped store that contains both users' stories would only ever
    // be asked for OWNER's slice — proving B's stories are excluded by
    // construction, not merely by luck of the fixture.
    const ownerStories = [{ title: 'Owner Story 1' }, { title: 'Owner Story 2' }];
    const sort = jest.fn().mockResolvedValue(ownerStories);
    const select = jest.fn().mockReturnValue({ sort });
    mockStory.find.mockImplementation((query) => {
      expect(query).toEqual({ userId: OWNER });
      return { select };
    });

    const res = await request(app())
      .get(`/api/stories/user/${OWNER}`)
      .set('x-test-user', OWNER);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(ownerStories);
    expect(res.body.some((s) => s.title.startsWith('Owner'))).toBe(true);
    expect(mockStory.find).toHaveBeenCalledTimes(1);
    expect(mockStory.find).not.toHaveBeenCalledWith({ userId: OTHER });
  });
});

describe('Characters resource — SECURITY FINDING: no ownership check', () => {
  function app() {
    return buildApp('/api/characters', characterRoutes);
  }

  test('unauthenticated request is still rejected with 401 (authenticateToken applies)', async () => {
    const res = await request(app()).get('/api/characters/story/story-1');
    expect(res.status).toBe(401);
  });

  // FINDING: routes/characters.js never compares story.userId against the
  // authenticated caller — any logged-in user who knows/guesses a storyId
  // can read, add, edit, or delete another user's characters. These
  // assertions document the ACTUAL (insecure) behavior on purpose, per
  // task instructions ("assert the code's actual contract; 200 is a
  // finding") — they are not the desired contract, and should start
  // failing (403 expected) once the route is fixed.
  test('a non-owner can currently read another user\'s story characters (200, not 403)', async () => {
    const story = buildStoryDoc({ userId: OWNER, characters: [{ name: 'Aldric', description: 'A knight' }] });
    mockStory.findById.mockResolvedValue(story);

    const res = await request(app())
      .get('/api/characters/story/story-1')
      .set('x-test-user', OTHER);

    expect(res.status).toBe(200);
    expect(res.body[0].name).toBe('Aldric');
  });

  test('a non-owner can currently add a character to another user\'s story (200, not 403)', async () => {
    const story = buildStoryDoc({ userId: OWNER, characters: [] });
    story.save = jest.fn().mockResolvedValue(story);
    mockStory.findById.mockResolvedValue(story);

    const res = await request(app())
      .post('/api/characters/story/story-1')
      .set('x-test-user', OTHER)
      .send({ name: 'Intruder', description: 'Added by a non-owner' });

    expect(res.status).toBe(200);
    expect(story.characters).toHaveLength(1);
  });

  test('a non-owner can currently delete another user\'s character (200, not 403)', async () => {
    const story = buildStoryDoc({ userId: OWNER, characters: [{ name: 'Aldric', description: 'A knight' }] });
    story.save = jest.fn().mockResolvedValue(story);
    mockStory.findById.mockResolvedValue(story);

    const res = await request(app())
      .delete('/api/characters/story/story-1/character/Aldric')
      .set('x-test-user', OTHER);

    expect(res.status).toBe(200);
    expect(story.characters).toHaveLength(0);
  });
});

describe('Export/bookify resource — SECURITY FINDING: no ownership check', () => {
  function app() {
    return buildApp('/api/export', exportRoutes);
  }

  test('unauthenticated request is still rejected with 401 (authenticateToken applies)', async () => {
    const res = await request(app()).post('/api/export/stories/story-1/bookify');
    expect(res.status).toBe(401);
  });

  // FINDING: bookService.bookify(storyId, userToken) loads the story purely
  // by id and never checks it against the caller — export.js's route
  // handler doesn't check ownership either. Any authenticated user can
  // export (bookify/epub) any other user's story.
  test('a non-owner can currently bookify another user\'s story (200, not 403)', async () => {
    mockBookify.mockResolvedValue({ title: 'Someone Else\'s Story', genre: 'Fantasy', content: '...' });

    const res = await request(app())
      .post('/api/export/stories/story-1/bookify')
      .set('x-test-user', OTHER)
      .send();

    expect(res.status).toBe(200);
    expect(mockBookify).toHaveBeenCalledWith('story-1', undefined);
  });
});
