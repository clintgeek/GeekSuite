// The turn lifecycle over HTTP (SUITE_REVIEW_2026-11 items 4 and 5,
// 2026-11-16): a resend of a turn that already landed is answered from its
// receipt instead of being played twice, and no two writing turns for one
// story run at once.
//
// Hermetic, same technique as aiFailSoftRoutes.test.js: the real router and
// controller, with doubles for auth, the Story model and the AI services. No
// Mongo, no network, no AI call. The lock's own atomicity and expiry are
// covered against the filter semantics in ../turnLock.test.js.

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const OWNER = 'user-owner';
const OTHER = 'user-other';
const CLIENT = 'client-0001-aaaa';
const mod = (p) => new URL(p, import.meta.url).pathname;

jest.unstable_mockModule(mod('../../middleware/auth.js'), () => ({
  authenticateToken: (req, res, next) => {
    const userId = req.header('x-test-user');
    if (!userId) return res.status(401).json({ error: 'User authentication required' });
    req.user = { _id: userId, id: userId, userId };
    next();
  },
}));

const mockStory = jest.fn();
mockStory.findById = jest.fn();
mockStory.findOneAndUpdate = jest.fn();
mockStory.updateOne = jest.fn(async () => ({ matchedCount: 1 }));
jest.unstable_mockModule(mod('../../models/Story.js'), () => ({ default: mockStory }));

const mockGenerate = jest.fn();
jest.unstable_mockModule(mod('../../services/aiService.js'), () => ({
  default: { generateStoryResponse: mockGenerate },
}));

const mockIsCanonQuery = jest.fn().mockReturnValue(false);
const mockAnswerCanon = jest.fn();
jest.unstable_mockModule(mod('../../services/canonQueryService.js'), () => ({
  default: { isCanonQuery: mockIsCanonQuery, answerCanonQuery: mockAnswerCanon },
}));
jest.unstable_mockModule(mod('../../services/contextService.js'), () => ({
  default: {
    buildTurnContext: jest.fn().mockResolvedValue({
      prompt: 'ctx', turnContext: { presentCharacterNames: [], liveFactsBlock: '', activeThreadsBlock: '' },
    }),
  },
}));
jest.unstable_mockModule(mod('../../services/stateExtractionService.js'), () => ({
  default: { extractChanges: jest.fn().mockResolvedValue({ proposal: null, modelUsed: null }) },
}));
jest.unstable_mockModule(mod('../../services/stateCommitService.js'), () => ({
  default: { applyProposal: jest.fn().mockReturnValue({ applied: 0, rejected: [], conflicts: [] }) },
}));

const { default: storyRoutes } = await import('../../routes/stories.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/stories', storyRoutes);
  return app;
}

function activeStory(extra = {}) {
  const story = {
    _id: 'story-abc', userId: OWNER, title: 'The Cursed Forest', genre: 'Fantasy', status: 'active',
    events: [{ type: 'narrative', description: 'opening' }],
    worldState: { turnNumber: 3, currentSituation: 'in the woods' },
    storyState: { canonAlerts: [], establishedFacts: [] },
    storyThreads: [], diceResults: [], characters: [], locations: [], checkpoints: [],
    stats: { totalInteractions: 3, totalDiceRolls: 0, lastActive: new Date() },
    aiContext: { lastPrompt: 'a prompt' },
    markModified: jest.fn(),
    ...extra,
  };
  story.save = jest.fn(async () => {
    // What was on the document at the moment it was written.
    story.savedReceipts = (story.turnReceipts || []).map((r) => r.clientId);
    return story;
  });
  return story;
}

const liveLock = (clientId) => ({
  token: 'their-token', clientId,
  startedAt: new Date(Date.now() - 10_000), expiresAt: new Date(Date.now() + 60_000),
});

const send = (body, user = OWNER) => request(buildApp())
  .post('/api/stories/story-abc/continue').set('x-test-user', user).send(body);

beforeEach(() => {
  jest.clearAllMocks();
  mockIsCanonQuery.mockReturnValue(false);
  mockGenerate.mockResolvedValue({ content: 'The door gives way.' });
});

describe('a turn is idempotent on its clientId', () => {
  test('the turn and its receipt are written in the same save', async () => {
    const story = activeStory();
    mockStory.findById.mockResolvedValue(story);
    mockStory.findOneAndUpdate.mockResolvedValue(story);

    const res = await send({ userInput: 'I push the door.', clientId: CLIENT });

    expect(res.status).toBe(200);
    expect(res.body.aiResponse).toBe('The door gives way.');
    expect(story.save).toHaveBeenCalledTimes(1);
    expect(story.savedReceipts).toEqual([CLIENT]);
    expect(story.turnReceipts[0]).toMatchObject({ clientId: CLIENT, turnNumber: 4 });
  });

  test('a resend of a turn that landed gets the same turn back — no AI call, no second event', async () => {
    const story = activeStory({
      turnReceipts: [{ clientId: CLIENT, turnNumber: 4, response: { aiResponse: 'The door gives way.', turnNumber: 4 } }],
    });
    mockStory.findById.mockResolvedValue(story);

    const res = await send({ userInput: 'I push the door.', clientId: CLIENT });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ aiResponse: 'The door gives way.', turnNumber: 4, replayed: true, clientId: CLIENT });
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockStory.findOneAndUpdate).not.toHaveBeenCalled();
    expect(story.save).not.toHaveBeenCalled();
    expect(story.events).toHaveLength(1);
  });

  test('a resend that loses the race to its own original is still answered from the receipt', async () => {
    // Read: no receipt yet. Lock: taken (the original is finishing). Re-read: landed.
    mockStory.findById
      .mockResolvedValueOnce(activeStory({ turnLock: liveLock(CLIENT) }))
      .mockResolvedValueOnce(activeStory({
        turnReceipts: [{ clientId: CLIENT, turnNumber: 4, response: { aiResponse: 'The door gives way.' } }],
      }));
    mockStory.findOneAndUpdate.mockResolvedValue(null);

    const res = await send({ userInput: 'I push the door.', clientId: CLIENT });

    expect(res.status).toBe(200);
    expect(res.body.replayed).toBe(true);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  test('a turn the narrator could not serve leaves no receipt, so the same clientId can try again', async () => {
    const story = activeStory();
    mockStory.findById.mockResolvedValue(story);
    mockStory.findOneAndUpdate.mockResolvedValue(story);
    mockGenerate.mockRejectedValue(Object.assign(new Error('Every model is busy.'), { code: 'AI_UNAVAILABLE', reason: 'unavailable' }));

    const res = await send({ userInput: 'I push the door.', clientId: CLIENT });

    expect(res.body.type).toBe('ai_unavailable');
    expect(story.save).not.toHaveBeenCalled();
    expect(story.turnReceipts).toBeUndefined();
    // …and the lock it took is let go.
    expect(mockStory.updateOne).toHaveBeenCalledWith(
      { _id: 'story-abc', 'turnLock.token': expect.any(String) },
      { $unset: { turnLock: '' } }
    );
  });

  test('a clientId that is not a plain token is refused before anything runs', async () => {
    const res = await send({ userInput: 'I push the door.', clientId: 'bad id; $where' });
    expect(res.status).toBe(400);
    expect(mockStory.findById).not.toHaveBeenCalled();
  });
});

describe('one writing turn per story at a time', () => {
  test('a second turn while one is being written gets 409 TURN_IN_PROGRESS and costs nothing', async () => {
    mockStory.findById.mockResolvedValue(activeStory({ turnLock: liveLock('client-other-device') }));
    mockStory.findOneAndUpdate.mockResolvedValue(null);

    const res = await send({ userInput: 'I run.', clientId: CLIENT });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TURN_IN_PROGRESS');
    expect(res.body.error.message).toMatch(/already being written/i);
    expect(res.body.turnInProgress.yours).toBe(false);
    expect(res.body.turnInProgress.expiresAt).toBeTruthy();
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  test('a resend whose original is still running is told it is its own turn', async () => {
    mockStory.findById.mockResolvedValue(activeStory({ turnLock: liveLock(CLIENT) }));
    mockStory.findOneAndUpdate.mockResolvedValue(null);

    const res = await send({ userInput: 'I run.', clientId: CLIENT });

    expect(res.status).toBe(409);
    expect(res.body.turnInProgress.yours).toBe(true);
  });

  test('the lock is taken atomically, only when free or expired, and released before the answer', async () => {
    const story = activeStory();
    mockStory.findById.mockResolvedValue(story);
    mockStory.findOneAndUpdate.mockResolvedValue(story);
    const order = [];
    mockStory.updateOne.mockImplementation(async () => { order.push('release'); return { matchedCount: 1 }; });
    const app = express();
    app.use((req, res, next) => { res.on('finish', () => order.push('answered')); next(); });
    app.use(express.json());
    app.use('/api/stories', storyRoutes);

    const res = await request(app).post('/api/stories/story-abc/continue')
      .set('x-test-user', OWNER).send({ userInput: 'I push the door.', clientId: CLIENT });

    expect(res.status).toBe(200);
    const [filter, update] = mockStory.findOneAndUpdate.mock.calls[0];
    expect(filter).toMatchObject({ _id: 'story-abc', userId: OWNER });
    expect(filter.$or).toEqual([
      { 'turnLock.expiresAt': null },
      { 'turnLock.expiresAt': { $lte: expect.any(Date) } },
    ]);
    const lock = update.$set.turnLock;
    expect(lock.clientId).toBe(CLIENT);
    expect(lock.expiresAt.getTime() - lock.startedAt.getTime()).toBe(5 * 60 * 1000);
    expect(order).toEqual(['release', 'answered']);
    expect(mockStory.updateOne).toHaveBeenCalledWith(
      { _id: 'story-abc', 'turnLock.token': lock.token }, { $unset: { turnLock: '' } }
    );
  });

  test('the lock is released when the turn blows up', async () => {
    const story = activeStory();
    story.save = jest.fn().mockRejectedValue(new Error('VersionError'));
    mockStory.findById.mockResolvedValue(story);
    mockStory.findOneAndUpdate.mockResolvedValue(story);

    const res = await send({ userInput: 'I push the door.', clientId: CLIENT });

    expect(res.status).toBe(500);
    expect(mockStory.updateOne).toHaveBeenCalledTimes(1);
  });

  test('a /recall question takes no lock: asking what you know never waits on a turn', async () => {
    mockStory.findById.mockResolvedValue(activeStory({ turnLock: liveLock('client-other-device') }));
    mockAnswerCanon.mockResolvedValue({ type: 'canon_answer', facts: [] });

    const res = await send({ userInput: '/recall the door', clientId: CLIENT });

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('canon_answer');
    expect(mockStory.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('/checkpoint writes, so it takes the lock and leaves a receipt', async () => {
    const story = activeStory();
    mockStory.findById.mockResolvedValue(story);
    mockStory.findOneAndUpdate.mockResolvedValue(story);

    const res = await send({ userInput: '/checkpoint before the door', clientId: CLIENT });

    expect(res.body.type).toBe('checkpoint_created');
    expect(mockStory.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(story.savedReceipts).toEqual([CLIENT]);
  });
});

describe('GET /:storyId/turns/:clientId — did it land?', () => {
  const status = (clientId = CLIENT, user = OWNER) => request(buildApp())
    .get(`/api/stories/story-abc/turns/${clientId}`).set('x-test-user', user);

  test('done, with the turn it produced', async () => {
    mockStory.findById.mockResolvedValue(activeStory({
      turnReceipts: [{ clientId: CLIENT, turnNumber: 4, response: { aiResponse: 'The door gives way.' } }],
    }));
    const res = await status();
    expect(res.body).toMatchObject({ status: 'done', turnNumber: 4, turnInProgress: null });
    expect(res.body.response.aiResponse).toBe('The door gives way.');
  });

  test('in progress while its lock is live', async () => {
    mockStory.findById.mockResolvedValue(activeStory({ turnLock: liveLock(CLIENT) }));
    const res = await status();
    expect(res.body.status).toBe('in_progress');
    expect(res.body.turnInProgress.clientId).toBe(CLIENT);
    expect(JSON.stringify(res.body)).not.toContain('their-token');
  });

  test('unknown when nothing landed and nothing runs — even past an expired lock', async () => {
    mockStory.findById.mockResolvedValue(activeStory({
      turnLock: { token: 't', clientId: CLIENT, expiresAt: new Date(Date.now() - 1000) },
    }));
    const res = await status();
    expect(res.body).toMatchObject({ status: 'unknown', turnInProgress: null });
  });

  test('another device’s turn shows as turnInProgress, not as this one', async () => {
    mockStory.findById.mockResolvedValue(activeStory({ turnLock: liveLock('client-other-device') }));
    const res = await status();
    expect(res.body.status).toBe('unknown');
    expect(res.body.turnInProgress).toBeTruthy();
  });

  test("owner only", async () => {
    mockStory.findById.mockResolvedValue(activeStory());
    expect((await status(CLIENT, OTHER)).status).toBe(403);
  });
});

describe('GET /:storyId — what the play screen gets', () => {
  test('turnInProgress, bookmark-only checkpoints, and never the receipts or the lock token', async () => {
    mockStory.findById.mockResolvedValue(activeStory({
      turnLock: liveLock('client-other-device'),
      turnReceipts: [{ clientId: CLIENT, response: { aiResponse: 'x' } }],
      checkpoints: [{ id: 'cp1', description: 'Gate', turnNumber: 2, timestamp: new Date(), events: [{ description: 'a whole transcript' }] }],
    }));

    const res = await request(buildApp()).get('/api/stories/story-abc').set('x-test-user', OWNER);

    expect(res.status).toBe(200);
    expect(res.body.turnInProgress).toMatchObject({ clientId: 'client-other-device' });
    expect(res.body.turnReceipts).toBeUndefined();
    expect(res.body.turnLock).toBeUndefined();
    expect(res.body.checkpoints).toEqual([{ id: 'cp1', description: 'Gate', turnNumber: 2, timestamp: expect.any(String) }]);
    // …and the snapshots are not even read out of Mongo.
    expect(mockStory.findById.mock.calls[0][1]).toMatchObject({ 'checkpoints.events': 0, turnReceipts: 0 });
  });
});
