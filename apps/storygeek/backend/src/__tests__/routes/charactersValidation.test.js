// Input-validation coverage for routes/characters.js (POST /story/:storyId,
// PUT/DELETE/PATCH .../character/:characterName, POST/DELETE
// .../inventory[/:itemName]), added as part of DOCS/TODO_ORDER.md #22
// (storygeek slice).
//
// Same technique as crossUserOwnership.test.js: the real Express router
// runs for real, with `middleware/auth.js` replaced by a test double and
// the Mongoose `Story` model replaced by plain jest mocks. No live Mongo.

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

const mockStory = { findById: jest.fn() };
jest.unstable_mockModule(mod('../../models/Story.js'), () => ({
  default: mockStory,
}));

const { default: characterRoutes } = await import('../../routes/characters.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/characters', characterRoutes);
  return app;
}

function storyWithCharacter(overrides = {}) {
  return buildStoryDoc({
    userId: OWNER,
    characters: [{ name: 'Aldric', description: 'A knight', isActive: true, inventory: [{ name: 'Sword', quantity: 1 }] }],
    ...overrides,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/characters/story/:storyId (create) validation', () => {
  test('accepted: a plausible character is added', async () => {
    const story = storyWithCharacter({ characters: [] });
    mockStory.findById.mockResolvedValue(story);

    const res = await request(buildApp())
      .post('/api/characters/story/story-1')
      .set('x-test-user', OWNER)
      .send({ name: 'Elowen', description: 'A wandering mage', status: 'alive' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Elowen');
    expect(story.characters).toHaveLength(1);
  });

  test('rejected: missing description never reaches the controller', async () => {
    // requireStoryOwner (mounted ahead of this route's own body schema, see
    // characters.js) already loaded the story by the time body validation
    // runs — findById fires, but the character is never pushed/saved.
    const story = storyWithCharacter({ characters: [] });
    mockStory.findById.mockResolvedValue(story);

    const res = await request(buildApp())
      .post('/api/characters/story/story-1')
      .set('x-test-user', OWNER)
      .send({ name: 'Elowen' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'description' })])
    );
    expect(story.characters).toHaveLength(0);
  });

  test('rejected: an unrecognized status is a 400, not silently coerced', async () => {
    const res = await request(buildApp())
      .post('/api/characters/story/story-1')
      .set('x-test-user', OWNER)
      .send({ name: 'Elowen', description: 'A mage', status: 'zombified' });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'status' })])
    );
  });

  test('rejected: an oversized inventory array (>100) is a 400', async () => {
    const inventory = Array.from({ length: 101 }, (_, i) => ({ name: `Item ${i}` }));

    const res = await request(buildApp())
      .post('/api/characters/story/story-1')
      .set('x-test-user', OWNER)
      .send({ name: 'Elowen', description: 'A mage', inventory });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'inventory' })])
    );
  });

  test('rejected: an unrecognized field is a 400', async () => {
    const res = await request(buildApp())
      .post('/api/characters/story/story-1')
      .set('x-test-user', OWNER)
      .send({ name: 'Elowen', description: 'A mage', notAField: true });

    expect(res.status).toBe(400);
  });
});

describe('PUT /api/characters/story/:storyId/character/:characterName validation', () => {
  test('accepted: a partial update (status only) is allowed', async () => {
    const story = storyWithCharacter();
    mockStory.findById.mockResolvedValue(story);

    const res = await request(buildApp())
      .put('/api/characters/story/story-1/character/Aldric')
      .set('x-test-user', OWNER)
      .send({ status: 'missing' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('missing');
  });

  test('rejected: an unrecognized relationshipType is a 400', async () => {
    const res = await request(buildApp())
      .put('/api/characters/story/story-1/character/Aldric')
      .set('x-test-user', OWNER)
      .send({ relationships: [{ characterName: 'Elowen', relationshipType: 'nemesis' }] });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: expect.stringContaining('relationships') })])
    );
  });

  test('rejected: description over 5000 chars is a 400', async () => {
    const res = await request(buildApp())
      .put('/api/characters/story/story-1/character/Aldric')
      .set('x-test-user', OWNER)
      .send({ description: 'x'.repeat(5001) });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'description' })])
    );
  });

  test('rejected: an oversized characterName param is a 400', async () => {
    // requireStoryOwner already ran (it only checks storyId), so findById
    // fired — but the route handler itself never runs.
    mockStory.findById.mockResolvedValue(storyWithCharacter());

    const res = await request(buildApp())
      .put(`/api/characters/story/story-1/character/${'a'.repeat(201)}`)
      .set('x-test-user', OWNER)
      .send({ status: 'alive' });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'characterName' })])
    );
  });
});

describe('POST /api/characters/story/:storyId/character/:characterName/inventory validation', () => {
  test('accepted: a plausible item is added', async () => {
    const story = storyWithCharacter();
    mockStory.findById.mockResolvedValue(story);

    const res = await request(buildApp())
      .post('/api/characters/story/story-1/character/Aldric/inventory')
      .set('x-test-user', OWNER)
      .send({ name: 'Shield', quantity: 1 });

    expect(res.status).toBe(200);
    expect(res.body.some((i) => i.name === 'Shield')).toBe(true);
  });

  test('rejected: missing name never reaches the controller', async () => {
    const story = storyWithCharacter();
    mockStory.findById.mockResolvedValue(story);

    const res = await request(buildApp())
      .post('/api/characters/story/story-1/character/Aldric/inventory')
      .set('x-test-user', OWNER)
      .send({ description: 'no name given' });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'name' })])
    );
    expect(story.characters[0].inventory).toHaveLength(1); // unchanged
  });

  test('rejected: an unrecognized field is a 400', async () => {
    const res = await request(buildApp())
      .post('/api/characters/story/story-1/character/Aldric/inventory')
      .set('x-test-user', OWNER)
      .send({ name: 'Shield', cursed: true });

    expect(res.status).toBe(400);
  });
});

describe('storyId params validation (shared across the router)', () => {
  test('rejected: an oversized storyId is a 400 before requireStoryOwner runs', async () => {
    const res = await request(buildApp())
      .get(`/api/characters/story/${'s'.repeat(65)}`)
      .set('x-test-user', OWNER);

    expect(res.status).toBe(400);
    expect(mockStory.findById).not.toHaveBeenCalled();
  });
});

describe('400 shape', () => {
  test('matches { success:false, error: { message, code, details: [{ path, message }] } }', async () => {
    const res = await request(buildApp())
      .post('/api/characters/story/story-1')
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
