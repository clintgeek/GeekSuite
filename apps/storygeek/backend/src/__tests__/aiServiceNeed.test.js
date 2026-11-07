/**
 * StoryGeek's aiGeek client can say what a call NEEDS (`need`), the same
 * validation-free pass-through fitnessgeek's aiGeekClient has: aiGeek
 * validates the grammar and an unresolvable need degrades to the ordinary
 * routing walk. Before 2026-11-06 the body was built without it, so no
 * StoryGeek feature could ask for `structured:fast` even where that is what
 * it needs (audit #14).
 *
 * The HTTP layer is stubbed. Nothing here reaches a network.
 */

import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';

import aiService from '../services/aiService.js';

const realPost = axios.post;
const realServiceKey = aiService.serviceKey;
let bodies = [];

beforeEach(() => {
  bodies = [];
  aiService.serviceKey = 'test-key';
  axios.post = async (_url, body) => {
    bodies.push(body);
    return { data: { ok: true, data: 'x', provenance: { source: 'model', hints: [] } } };
  };
});

afterEach(() => {
  axios.post = realPost;
  aiService.serviceKey = realServiceKey;
});

describe('feature() need pass-through', () => {
  test('a need is sent as given', async () => {
    await aiService.feature('aux', { messages: [{ role: 'user', content: 'hi' }], need: 'structured:fast' });
    assert.equal(bodies[0].need, 'structured:fast');
  });

  test('no need, no field — the routing row decides as before', async () => {
    await aiService.feature('aux', { messages: [{ role: 'user', content: 'hi' }] });
    assert.equal('need' in bodies[0], false);
  });

  test('callAuxAI carries a caller\'s need through to the door', async () => {
    await aiService.callAuxAI('extract the state', { need: 'structured:fast' });
    assert.equal(bodies[0].feature, 'aux');
    assert.equal(bodies[0].need, 'structured:fast');
  });

  test('callAuxAI without a need sends none', async () => {
    await aiService.callAuxAI('extract the state');
    assert.equal('need' in bodies[0], false);
  });
});
