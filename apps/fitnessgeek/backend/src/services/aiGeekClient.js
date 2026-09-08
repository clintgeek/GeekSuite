/**
 * aiGeekClient — FitnessGeek's one door to aiGeek.
 *
 * Every AI call this backend makes goes through `feature(name, payload)` and
 * lands on `POST /api/ai/feature` (aiGeek front door, Phase 2 —
 * apps/basegeek/DOCS/AIGEEK_FRONT_DOOR.md §4). It replaces three separate
 * axios wrappers (`baseGeekAIService.callAI`, `fitnessGoalService.callAI`,
 * `baseGeekAIService.chatWithHistory`) that each spoke a different dialect of
 * the deprecated `/api/ai/call` and each 500'd the user on any failure.
 *
 * Two rules, and they are the whole point of the file:
 *
 *   1. **It never throws.** A failure is a value: `{ ok: false, reason }`.
 *      Callers pick a deterministic fallback or a friendly message; nothing
 *      in this app turns an unavailable free tier into a stack trace.
 *   2. **Nothing here names a provider or a model.** Routing is aiGeek's
 *      business, resolved from this app's routing row and the credential.
 *      A `provider`+`model` pair is only ever forwarded when a *caller*
 *      hands one over (FitnessGeek never does today).
 *
 * Auth is the app's own service key (`AI_GEEK_API_KEY`, app `fitnessgeek`,
 * permission `ai:call`) — the same credential and header the old
 * `/api/ai/call` used. aiGeek resolves the app from that credential, so
 * nothing in the body says who is calling.
 */

import axios from 'axios';
import logger from '../config/logger.js';

/** aiGeek clamps `timeoutMs` to [1000, 60000]; clamp on this side too. */
const MIN_TIMEOUT_MS = 1000;
export const MAX_TIMEOUT_MS = 60000;
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * The one sentence a user sees when the model could not answer and the
 * feature has no deterministic fallback. Deliberately says nothing about
 * providers, quotas or HTTP — none of that is the user's problem.
 */
export const UNAVAILABLE_MESSAGE = "The assistant isn't available right now.";

const clampTimeout = (ms) => {
  const n = Number(ms);
  if (!Number.isFinite(n)) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(n)));
};

/** Provenance for a call that never reached a model. */
const noProvenance = (reason) => ({
  source: 'none',
  reason,
  model: null,
  provider: null,
  cached: false,
  callsToday: 0,
  cap: null,
  costUsd: 0,
  hints: []
});

const softFailure = (reason, extra = {}) => ({
  ok: false,
  data: null,
  reason,
  message: UNAVAILABLE_MESSAGE,
  provenance: noProvenance(reason),
  ...extra
});

class AIGeekClient {
  constructor() {
    this.baseGeekUrl = (process.env.BASEGEEK_URL || 'https://basegeek.clintgeek.com').replace(/\/$/, '');
    this.apiKey = process.env.AI_GEEK_API_KEY || '';
    this._http = null;
  }

  isConfigured() {
    return !!this.apiKey;
  }

  /**
   * One axios instance for the process. Built lazily so the module can be
   * imported before the environment is loaded, and so tests can replace
   * `client.http` wholesale.
   */
  get http() {
    if (!this._http) {
      this._http = axios.create({
        baseURL: this.baseGeekUrl,
        headers: { 'Content-Type': 'application/json' },
        // Per-call `timeout` always overrides this; the ceiling is here so a
        // caller that forgets cannot hold a request open forever.
        timeout: MAX_TIMEOUT_MS
      });
    }
    return this._http;
  }

  set http(instance) {
    this._http = instance;
  }

  /**
   * Call one aiGeek feature.
   *
   * @param {string} name        the `feature` slice of this app (e.g. `coaching`)
   * @param {object} payload     `messages` | `system` + `user`, plus optional
   *                             `schema`, `conversationId`, `maxTokens`,
   *                             `temperature`, `maxCallsPerDay`, and a
   *                             `provider`+`model` pin if the caller has one,
   *                             and `quotaKey` (the per-user cap bucket)
   * @param {object} [options]   `{ timeoutMs }` — clamped to [1000, 60000]
   * @returns {Promise<{ok: boolean, data: any, reason: string|null,
   *                    message?: string, provenance: object}>}
   *          `data` is the parsed object when a `schema` was sent, else the
   *          model's text. Never throws.
   */
  async feature(name, payload = {}, options = {}) {
    if (!name || typeof name !== 'string') {
      throw new TypeError('aiGeekClient.feature requires a feature name');
    }

    if (!this.isConfigured()) {
      // Not an error the user should see as an error: the app simply has no
      // AI credential, which is a deployment state, not a fault of theirs.
      logger.warn('aiGeek feature skipped — AI_GEEK_API_KEY is not configured', { feature: name });
      return softFailure('unavailable');
    }

    const timeoutMs = clampTimeout(options.timeoutMs ?? payload.timeoutMs);

    const body = { feature: name, timeoutMs };
    if (Array.isArray(payload.messages)) body.messages = payload.messages;
    if (payload.system != null) body.system = payload.system;
    if (payload.user != null) body.user = payload.user;
    if (payload.schema) body.schema = payload.schema;
    if (payload.conversationId != null) body.conversationId = String(payload.conversationId);
    if (payload.maxTokens != null) body.maxTokens = payload.maxTokens;
    if (payload.temperature != null) body.temperature = payload.temperature;
    if (payload.maxCallsPerDay != null) body.maxCallsPerDay = payload.maxCallsPerDay;
    // The per-day cap bucket. A service key carries no session, so aiGeek's
    // `userId` is null and every call from this backend would otherwise share
    // one app-wide bucket — one heavy user could spend the whole app's cap.
    // Opaque id only, and never load-bearing for auth: it selects a counter,
    // it does not grant anything.
    if (payload.quotaKey != null) body.quotaKey = String(payload.quotaKey);
    // provider + model together are a pin, and only a pin. One without the
    // other is not a route aiGeek accepts, so it is not one this client sends.
    if (payload.provider && payload.model) {
      body.provider = payload.provider;
      body.model = payload.model;
    }

    try {
      const response = await this.http.post('/api/ai/feature', body, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        // A little headroom over the server's own soft timeout so aiGeek gets
        // to answer `{ ok: false, reason: 'timeout' }` rather than the socket
        // dying first and costing us the provenance.
        timeout: Math.min(MAX_TIMEOUT_MS, timeoutMs + 5000)
      });

      const envelope = response.data || {};
      const provenance = envelope.provenance || noProvenance(envelope.reason || 'unavailable');

      if (envelope.ok) {
        logger.info('aiGeek feature answered', {
          feature: name,
          provider: provenance.provider,
          model: provenance.model,
          cached: provenance.cached,
          callsToday: provenance.callsToday
        });
        return { ok: true, data: envelope.data, reason: null, provenance };
      }

      const reason = envelope.reason || 'unavailable';
      logger.warn('aiGeek feature declined', { feature: name, reason, hints: provenance.hints });
      return { ok: false, data: null, reason, message: UNAVAILABLE_MESSAGE, provenance };

    } catch (error) {
      // 4xx/5xx here means auth, validation or an envelope error — aiGeek's
      // `{ success: false, error: { message, type, code } }`. The provider's
      // own words are never in it, and neither is our credential; the code is
      // worth a log line and nothing more.
      const status = error.response?.status ?? null;
      const code = error.response?.data?.error?.code ?? error.code ?? null;
      const reason = (status === 408 || status === 504 || code === 'ECONNABORTED' || code === 'ETIMEDOUT')
        ? 'timeout'
        : 'unavailable';

      logger.error('aiGeek feature call failed', {
        feature: name,
        status,
        code,
        reason
      });

      return softFailure(reason, { errorCode: code, status });
    }
  }

  /**
   * The alive-model list (`GET /api/ai/models/alive`, permission `ai:models`).
   * FitnessGeek has no model picker, so nothing calls this today; it is here
   * so a future one has no reason to open a second axios instance.
   *
   * @returns {Promise<Array<{provider: string, modelId: string, fitness: number,
   *                          paid: boolean, lastSuccessAt: string}>>} — `[]` on
   *          any failure, never a throw.
   */
  async modelsAlive() {
    if (!this.isConfigured()) return [];
    try {
      const response = await this.http.get('/api/ai/models/alive', {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        timeout: 15000
      });
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      logger.warn('aiGeek alive-model list unavailable', { status: error.response?.status ?? null });
      return [];
    }
  }

  /** What `/api/ai/status` reports. Says nothing about providers or models. */
  getStatus() {
    return {
      enabled: this.isConfigured(),
      baseGeekUrl: this.baseGeekUrl,
      apiKeyConfigured: this.isConfigured(),
      // Routing is the aiGeek AIAppConfig row for app `fitnessgeek`; this app
      // does not know, and must not claim to know, which model answers.
      routing: 'auto (aiGeek routing row for app fitnessgeek)'
    };
  }
}

export default new AIGeekClient();
