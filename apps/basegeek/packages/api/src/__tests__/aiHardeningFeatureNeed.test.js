/**
 * aiHardeningFeatureNeed.test.js — `need` over HTTP gets what `need` in
 * process gets.
 *
 * Until 2026-11-06 `POST /api/ai/feature` resolved a need to ONE pick itself
 * and handed it to the runner as an explicit pin. So the HTTP door lost
 * everything the runner does with a need: the next candidate when the first
 * fails at the provider, the demotion of a failed row, the shared resolution
 * cache, and paid-first. The route now passes `need` through.
 *
 * Real route and real runner; `aiService.callAI` and the resolver are stubbed
 * (the runner reads metadata through `callAIWithInfo` → `onInfo`).
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import crypto from 'node:crypto';
import pinoHttp from 'pino-http';

const { default: mongoose } = await import('mongoose');
const { default: logger } = await import('../lib/logger.js');
const { default: APIKey } = await import('../models/APIKey.js');
const { default: aiService } = await import('../services/aiService.js');
const { default: aiRoutes } = await import('../routes/aiRoutes.js');
const { _resetCounters, _resetNeedCache } = await import('../services/aiFeatureRunner.js');

const patched = [];
function patch(obj, key, value) {
  patched.push([obj, key, obj[key], Object.prototype.hasOwnProperty.call(obj, key)]);
  obj[key] = value;
  return value;
}

function buildApp() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  const httpLogger = pinoHttp({ logger, genReqId: () => crypto.randomUUID(), autoLogging: false });
  app.use((req, res, next) => { httpLogger(req, res); next(); });
  app.use('/api/ai', aiRoutes);
  return app;
}

let KEY;
let configs;
const CANDIDATES = [
  { provider: 'groq', modelId: 'first-pick', why: ['best'] },
  { provider: 'cerebras', modelId: 'second-pick', why: ['next'] },
];

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) await mongoose.connect(process.env.MONGODB_URI);
  const { apiKey, keyPrefix, keyHash } = APIKey.generateAPIKey();
  await APIKey.create({
    keyHash, keyPrefix, name: 'hardening feature need', appName: 'storygeek',
    permissions: ['ai:call'], createdBy: new mongoose.Types.ObjectId(),
    rateLimit: { requestsPerMinute: 1000, requestsPerHour: 10000 },
  });
  KEY = apiKey;
});

beforeEach(() => {
  _resetCounters();
  _resetNeedCache();
  configs = [];
  patch(aiService, 'initialized', true);
  patch(aiService, 'findAppConfig', async () => null);
  patch(aiService, 'resolveNeed', async () => CANDIDATES[0]);
  patch(aiService, 'resolveNeedCandidates', async () => CANDIDATES);
  patch(aiService, 'noteNeedFailure', () => {});
  patch(aiService, 'noteNeedSuccess', () => {});
  patch(aiService, 'paidFirstFor', async () => null);
  patch(aiService, 'callAI', async (_prompt, config = {}) => {
    configs.push(config);
    if (config.paidOnly) {
      config.onInfo?.({ provider: 'openrouter', model: 'vendor/paid', hints: ['paid_first_only'], costUsd: 0.001 });
      return 'paid answer';
    }
    if (config.provider === 'groq' && config.model === 'first-pick') {
      const e = new Error('upstream 502');
      e.status = 502;
      throw e;
    }
    config.onInfo?.({ provider: config.provider || 'groq', model: config.model || 'auto-row', hints: [], costUsd: 0 });
    return 'an answer';
  });
});

afterEach(() => {
  while (patched.length) {
    const [obj, key, original, had] = patched.pop();
    if (had) obj[key] = original;
    else delete obj[key];
  }
});

afterAll(async () => {
  await APIKey.deleteMany({ name: 'hardening feature need' });
});

const feature = (body) => request(buildApp())
  .post('/api/ai/feature')
  .set('Authorization', `Bearer ${KEY}`)
  .send({ feature: 'gm', user: 'hi', timeoutMs: 5000, ...body });

describe('POST /api/ai/feature with a need', () => {
  it('falls to the second candidate when the first fails at the provider', async () => {
    const res = await feature({ need: 'prose:deep' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(configs.map((c) => `${c.provider}/${c.model}`)).toEqual(['groq/first-pick', 'cerebras/second-pick']);
    expect(res.body.provenance.provider).toBe('cerebras');
    expect(res.body.provenance.need).toMatchObject({ asked: 'prose:deep', resolved: true, provider: 'cerebras', model: 'second-pick' });
    expect(res.body.provenance.need.fellBackFrom).toEqual(['groq/first-pick']);
  });

  it('applies the app\'s paid-first ahead of the need\'s free picks', async () => {
    patch(aiService, 'paidFirstFor', async () => ({ provider: 'openrouter', model: 'vendor/paid' }));
    const res = await feature({ need: 'prose:deep' });
    expect(res.body.ok).toBe(true);
    expect(configs[0].paidOnly).toBe(true);
    expect(res.body.provenance.need.paidFirst).toBe(true);
  });

  it('an explicit provider+model still wins over the need', async () => {
    let asked = 0;
    patch(aiService, 'resolveNeedCandidates', async () => { asked += 1; return CANDIDATES; });
    const res = await feature({ need: 'prose:deep', provider: 'cerebras', model: 'chosen' });
    expect(res.body.ok).toBe(true);
    expect(asked).toBe(0);
    expect(configs.map((c) => `${c.provider}/${c.model}`)).toEqual(['cerebras/chosen']);
    expect(res.body.provenance.need).toMatchObject({ asked: 'prose:deep', resolved: false });
  });

  it('keeps the vision refusal: no vision row → 200 ok:false no_vision_model, no call', async () => {
    patch(aiService, 'resolveNeed', async () => null);
    patch(aiService, 'resolveNeedCandidates', async () => []);
    const res = await feature({ need: 'vision:balanced' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: false, reason: 'unavailable', detail: 'no_vision_model' });
    expect(configs).toEqual([]);
  });
});
