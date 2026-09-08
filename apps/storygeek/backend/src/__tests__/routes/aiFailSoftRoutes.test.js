// A turn the narrator cannot serve, and the picker's model list — over HTTP.
//
// The rule (Phase 2, DOCS/AIGEEK_ELEVATION_PLAN.md): **a turn failure surfaces
// as the reason aiGeek gave, never as a bare 500 and never as the generic
// "Failed to generate story response"**. That string was the whole of what a
// player and an operator got for a rate limit, a retired model, a missing
// permission and a genuine bug alike.
//
// So `generateStoryResponse` throws an `AIUnavailableError`
// (`code: 'AI_UNAVAILABLE'`, `.reason`, aiGeek's own message) and every call
// site in the controller answers **200**
// `{ type: 'ai_unavailable', reason, message }`. 200 is right: nothing was
// persisted — the player's event and the turn increment live only on the
// in-memory document until the save at the end of a successful turn — so the
// record is untouched and the player's words are still theirs to send again.
//
// Hermetic, same technique as storiesValidation.test.js: the real routers with
// module doubles for auth, the Story model and the services. No Mongo, no
// network.

import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

const OWNER = 'user-owner';
const mod = (p) => new URL(p, import.meta.url).pathname;

jest.unstable_mockModule(mod('../../middleware/auth.js'), () => ({
  authenticateToken: (req, res, next) => {
    const userId = req.header('x-test-user');
    if (!userId) return res.status(401).json({ error: 'User authentication required' });
    req.user = { _id: userId, id: userId, userId };
    next();
  },
}));

const mockStory = jest.fn().mockImplementation(function ctor(doc) {
  Object.assign(this, doc);
  this._id = this._id || 'new-story-id';
  this.save = jest.fn().mockResolvedValue(this);
});
mockStory.findById = jest.fn();
mockStory.findByIdAndDelete = jest.fn();
jest.unstable_mockModule(mod('../../models/Story.js'), () => ({ default: mockStory }));

const mockGenerateStoryResponse = jest.fn();
const mockModelsAlive = jest.fn();
jest.unstable_mockModule(mod('../../services/aiService.js'), () => ({
  default: {
    generateStoryResponse: mockGenerateStoryResponse,
    modelsAlive: mockModelsAlive
  },
}));

const mockIsCanonQuery = jest.fn().mockReturnValue(false);
jest.unstable_mockModule(mod('../../services/canonQueryService.js'), () => ({
  default: { isCanonQuery: mockIsCanonQuery, answerCanonQuery: jest.fn() },
}));

jest.unstable_mockModule(mod('../../services/contextService.js'), () => ({
  default: {
    buildTurnContext: jest.fn().mockResolvedValue({
      prompt: 'the context package',
      turnContext: { presentCharacterNames: [], liveFactsBlock: '', activeThreadsBlock: '' }
    })
  },
}));

jest.unstable_mockModule(mod('../../services/stateExtractionService.js'), () => ({
  default: { extractChanges: jest.fn().mockResolvedValue({ proposal: null, modelUsed: null }) },
}));

jest.unstable_mockModule(mod('../../services/stateCommitService.js'), () => ({
  default: { applyProposal: jest.fn().mockReturnValue({ applied: 0, rejected: [], conflicts: [] }) },
}));

const { default: storyRoutes } = await import('../../routes/stories.js');
const { default: aiRoutes } = await import('../../routes/ai.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/stories', storyRoutes);
  app.use('/api/ai', aiRoutes);
  return app;
}

/** An active story owned by OWNER, with the fields continueStory touches. */
function activeStory() {
  const story = {
    _id: 'story-abc',
    userId: OWNER,
    title: 'The Cursed Forest',
    genre: 'Fantasy',
    status: 'active',
    events: [{ type: 'narrative', description: 'opening' }],
    worldState: { turnNumber: 3, currentSituation: 'in the woods' },
    storyState: { canonAlerts: [], establishedFacts: [] },
    storyThreads: [],
    diceResults: [],
    characters: [],
    locations: [],
    stats: { totalInteractions: 3, totalDiceRolls: 0, lastActive: new Date() },
    aiContext: { lastPrompt: 'a prompt' },
    markModified: jest.fn(),
  };
  story.save = jest.fn().mockResolvedValue(story);
  return story;
}

/** What aiService throws when no model could serve. */
function unavailable(reason, message) {
  const error = new Error(message);
  error.name = 'AIUnavailableError';
  error.code = 'AI_UNAVAILABLE';
  error.reason = reason;
  return error;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsCanonQuery.mockReturnValue(false);
});

describe('POST /api/stories/:storyId/continue — a turn the narrator cannot serve', () => {
  test('answers 200 with aiGeek\'s reason and words, not a 500', async () => {
    const story = activeStory();
    mockStory.findById.mockResolvedValue(story);
    mockGenerateStoryResponse.mockRejectedValue(
      unavailable('cap', 'The narrator has told all the story it can today. Come back tomorrow.')
    );

    const res = await request(buildApp())
      .post('/api/stories/story-abc/continue')
      .set('x-test-user', OWNER)
      .send({ userInput: 'I open the gate' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      type: 'ai_unavailable',
      reason: 'cap',
      message: 'The narrator has told all the story it can today. Come back tomorrow.'
    });
    // The generic string that used to swallow every cause.
    expect(JSON.stringify(res.body)).not.toContain('Failed to generate story response');
  });

  test('nothing is persisted, so the turn can simply be sent again', async () => {
    const story = activeStory();
    mockStory.findById.mockResolvedValue(story);
    mockGenerateStoryResponse.mockRejectedValue(unavailable('unavailable', 'The narrator is not answering right now.'));

    await request(buildApp())
      .post('/api/stories/story-abc/continue')
      .set('x-test-user', OWNER)
      .send({ userInput: 'I open the gate' });

    expect(story.save).not.toHaveBeenCalled();
  });

  test('a genuine bug is still a 500, and now says what it was', async () => {
    const story = activeStory();
    mockStory.findById.mockResolvedValue(story);
    mockGenerateStoryResponse.mockRejectedValue(new TypeError('diceService.roll is not a function'));

    const res = await request(buildApp())
      .post('/api/stories/story-abc/continue')
      .set('x-test-user', OWNER)
      .send({ userInput: 'I open the gate' });

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('diceService.roll is not a function');
  });

  test('a served turn carries the pin_unavailable notice through to the player', async () => {
    const story = activeStory();
    mockStory.findById.mockResolvedValue(story);
    mockGenerateStoryResponse.mockResolvedValue({
      content: 'The gate creaks open.',
      diceResult: null,
      diceMeta: null,
      modelUsed: 'groq:llama-3.3-70b-versatile',
      notice: "Your chosen model isn't answering; using the automatic pick."
    });

    const res = await request(buildApp())
      .post('/api/stories/story-abc/continue')
      .set('x-test-user', OWNER)
      .send({ userInput: 'I open the gate', provider: 'gemini', model: 'a-model-that-died' });

    expect(res.status).toBe(200);
    expect(res.body.aiResponse).toBe('The gate creaks open.');
    expect(res.body.notice).toBe("Your chosen model isn't answering; using the automatic pick.");
    // And the player's pin was passed to the service as `aiConfig`.
    expect(mockGenerateStoryResponse).toHaveBeenCalledWith(
      story, 'I open the gate', null, undefined,
      { provider: 'gemini', model: 'a-model-that-died' },
      'the context package'
    );
  });

  test('an automatic turn sends no pin and no notice', async () => {
    const story = activeStory();
    mockStory.findById.mockResolvedValue(story);
    mockGenerateStoryResponse.mockResolvedValue({
      content: 'The path forks.', diceResult: null, diceMeta: null, modelUsed: 'groq:llama', notice: null
    });

    const res = await request(buildApp())
      .post('/api/stories/story-abc/continue')
      .set('x-test-user', OWNER)
      .send({ userInput: 'I walk on' });

    expect(res.body.notice).toBeNull();
    const aiConfig = mockGenerateStoryResponse.mock.calls[0][4];
    expect(aiConfig).toEqual({ provider: undefined, model: undefined });
  });
});

describe('POST /api/stories/start — a story is not created half-way', () => {
  test('an unavailable narrator answers 200 and saves nothing', async () => {
    mockGenerateStoryResponse.mockRejectedValue(unavailable('timeout', 'The narrator took too long to answer.'));

    const res = await request(buildApp())
      .post('/api/stories/start')
      .set('x-test-user', OWNER)
      .send({ prompt: 'A lone knight rides into a cursed forest.', title: 'The Cursed Forest' });

    expect(res.status).toBe(200);
    expect(res.body.type).toBe('ai_unavailable');
    expect(res.body.reason).toBe('timeout');
    // The Story constructor is only reached after the questions come back.
    expect(mockStory).not.toHaveBeenCalled();
  });
});

describe('GET /api/ai/models/alive — the picker\'s list', () => {
  test('returns the alive rows, shaped for a picker', async () => {
    mockModelsAlive.mockResolvedValue([
      { provider: 'groq', modelId: 'llama-3.3-70b-versatile', fitness: 0.94, paid: false, lastSuccessAt: '2026-09-07T00:00:00Z' },
      { provider: 'openrouter', modelId: 'gpt-cheap', fitness: 0.5, paid: true, lastSuccessAt: null }
    ]);

    const res = await request(buildApp()).get('/api/ai/models/alive').set('x-test-user', OWNER);

    expect(res.status).toBe(200);
    expect(res.body.data.available).toBe(true);
    expect(res.body.data.models).toEqual([
      { provider: 'groq', modelId: 'llama-3.3-70b-versatile', fitness: 0.94, paid: false, lastSuccessAt: '2026-09-07T00:00:00Z' },
      { provider: 'openrouter', modelId: 'gpt-cheap', fitness: 0.5, paid: true, lastSuccessAt: null }
    ]);
  });

  test('an unreachable list is a 200 with an empty one — Automatic still works', async () => {
    mockModelsAlive.mockResolvedValue([]);

    const res = await request(buildApp()).get('/api/ai/models/alive').set('x-test-user', OWNER);

    expect(res.status).toBe(200);
    expect(res.body.data.models).toEqual([]);
    expect(res.body.data.available).toBe(false);
  });

  test('requires a session — it spends StoryGeek\'s own service key', async () => {
    // The two routes this replaced (`/providers`, `/director/models`) sat on an
    // unauthenticated router and forwarded the browser's cookie to basegeek,
    // so any anonymous caller could enumerate the suite's AI catalog.
    const res = await request(buildApp()).get('/api/ai/models/alive');

    expect(res.status).toBe(401);
    expect(mockModelsAlive).not.toHaveBeenCalled();
  });
});
