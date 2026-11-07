/**
 * fitnessInsightsGoverned.test.js
 *
 * End to end through the real `aiFeatureRunner`, with only `aiService`
 * mocked: a model outage on a FitnessGeek insight must answer the friendly
 * "isn't available right now" envelope (a 200 the card renders in place),
 * not throw a GraphQL error — and the call must be tagged with the
 * fitnessgeek routing row and a feature, and counted against a per-user cap.
 *
 * The runner-options contract is pinned in `fitnessInsightsGovernedRunner.test.js`.
 */

import { jest } from '@jest/globals';
import mongoose from 'mongoose';

const callAI = jest.fn();
const resolveNeedCandidates = jest.fn();
const chat = jest.fn();
const chatWithHistory = jest.fn();
const aiServiceMock = { callAI, resolveNeedCandidates, chat, chatWithHistory, lastProviderInfo: null };

jest.unstable_mockModule('../services/aiService.js', () => ({ default: aiServiceMock }));

const { _resetCounters, _resetNeedCache } = await import('../services/aiFeatureRunner.js');
const { default: UserSettings } = await import('../graphql/fitnessgeek/models/UserSettings.js');
const { resolvers } = await import('../graphql/fitnessgeek/resolvers.js');

const Q = resolvers.Query;
const M = resolvers.Mutation;
const ALICE = String(new mongoose.Types.ObjectId());
const BOB = String(new mongoose.Types.ObjectId());
const ctx = (id) => ({ user: { id } });

beforeAll(async () => {
  await UserSettings.db.asPromise();
}, 60000);

beforeEach(() => {
  _resetCounters();
  _resetNeedCache();
  callAI.mockReset();
  chat.mockReset();
  chatWithHistory.mockReset();
  resolveNeedCandidates.mockReset();
  resolveNeedCandidates.mockResolvedValue([]);
  aiServiceMock.lastProviderInfo = { provider: 'groq', model: 'llama' };
});

describe('a model outage is a friendly answer, not a GraphQL error', () => {
  test('coaching: aiGeek throwing → ok:false with the sentence', async () => {
    callAI.mockRejectedValue(new Error('all providers failed'));
    chat.mockRejectedValue(new Error('all providers failed'));

    const result = await Q.fitnessInsightsCoaching(null, {}, ctx(ALICE));
    expect(result).toMatchObject({
      ok: false,
      type: 'coaching',
      content: null,
      reason: 'unavailable',
      message: "The assistant isn't available right now.",
    });
    expect(result.provenance).toMatchObject({ source: 'fallback', reason: 'unavailable' });
  });

  test('chat: aiGeek throwing → ok:false with the sentence', async () => {
    callAI.mockRejectedValue(new Error('all providers failed'));
    chatWithHistory.mockRejectedValue(new Error('all providers failed'));

    const result = await M.fitnessInsightsChat(null, { message: 'hi', history: [] }, ctx(ALICE));
    expect(result).toMatchObject({ ok: false, type: 'chat', content: null, message: "The assistant isn't available right now." });
  });

  test('an empty model answer is also the friendly refusal, not a blank card', async () => {
    callAI.mockResolvedValue('   ');
    chat.mockResolvedValue('   ');
    const result = await Q.fitnessInsightsCorrelations(null, {}, ctx(ALICE));
    expect(result).toMatchObject({ ok: false, content: null, reason: 'empty' });
  });
});

describe('the call is routed and counted', () => {
  test('callAI is asked under the fitnessgeek row with a feature tag and the prose need', async () => {
    callAI.mockResolvedValue('Good morning.');
    chat.mockResolvedValue('Good morning.');

    const result = await Q.fitnessInsightsMorningBrief(null, {}, ctx(ALICE));
    expect(result).toMatchObject({ ok: true, type: 'morning_brief', content: 'Good morning.' });
    expect(result.provenance).toMatchObject({ source: 'model', provider: 'groq', model: 'llama', callsToday: 1 });

    expect(resolveNeedCandidates).toHaveBeenCalledWith('prose:balanced');
    expect(callAI).toHaveBeenCalledTimes(1);
    const [, cfg] = callAI.mock.calls[0];
    expect(cfg).toMatchObject({ appName: 'fitnessgeek', feature: 'brief', userId: ALICE });
  });

  test('the daily cap is per user: Alice spending hers leaves Bob his', async () => {
    callAI.mockResolvedValue('Advice.');
    chat.mockResolvedValue('Advice.');

    let last;
    for (let i = 0; i < 200; i += 1) {
      last = await Q.fitnessInsightsCoaching(null, {}, ctx(ALICE));
      if (last.ok === false) break;
    }
    expect(last).toMatchObject({ ok: false, reason: 'cap', message: "The assistant isn't available right now." });
    const capped = callAI.mock.calls.length;

    const bob = await Q.fitnessInsightsCoaching(null, {}, ctx(BOB));
    expect(bob).toMatchObject({ ok: true, content: 'Advice.' });
    expect(callAI.mock.calls.length).toBe(capped + 1);
  }, 60000);
});
