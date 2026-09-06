/**
 * aiFeatureRunner — the one door every in-gateway AI feature walks through.
 *
 * The five night-2 features (bujogeek review draft, fitnessgeek quick-add,
 * notegeek suggestions, bookgeek what-next / metadata drafts, startgeek brief)
 * share four obligations that are easy to get slightly different five times:
 *
 *   1. Routing. Calls go through aiGeek's App Routing row for the owning app
 *      (`useAppConfig` + `appName`), tagged with a `feature` so the usage
 *      panel can tell a review draft from a food parse. No provider or model
 *      is chosen here; the App Routing dialog decides.
 *   2. Quota. A per-user, per-feature daily cap, counted in UTC days, enforced
 *      before the model is asked. The cap is a ceiling on a hobby budget, not
 *      a rate limiter — aiService already has that.
 *   3. Fail-soft. When the cap is hit, aiGeek is unreachable, the model is
 *      slow (`timeoutMs`) or returns something the schema cannot parse, the
 *      feature's deterministic `fallback()` answers instead. Every feature
 *      must have one; a feature that would be blank without a model is a
 *      feature the suite does not ship.
 *   4. Provenance. Every result says where it came from, so the UI can label
 *      drafts `AI-drafted` and the fallback path is never mistaken for a model
 *      answer.
 *
 * Nothing here writes to a user's data. Runners return proposals; the user's
 * confirmation drives the ordinary mutation.
 *
 * Usage:
 *
 *   const result = await runAIFeature({
 *     app: 'bujogeek', feature: 'review', userId,
 *     system: '...', user: JSON.stringify(facts),
 *     schema: REVIEW_SCHEMA,            // JSON schema → parsed object, or omit for free text
 *     maxCallsPerDay: 10,
 *     fallback: () => ({ summary: deterministicBullets(facts) }),
 *   });
 *   // result = { data, provenance: { source: 'model'|'fallback', reason, model, provider, callsToday, cap } }
 */

import logger from '../lib/logger.js';
import aiService from './aiService.js';
import { internalCaller } from './callerIdentity.js';

export const DEFAULT_TIMEOUT_MS = 6000;
export const DEFAULT_MAX_CALLS_PER_DAY = 20;

// In-process, per-day counter. Restarts reset it, which is the right failure
// direction for a ceiling meant to bound cost, not to enforce fairness: a
// redeploy costs at most one extra day's cap. Keyed `app:feature:user:YYYY-MM-DD`.
const counters = new Map();

export function utcDay(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function counterKey(app, feature, userId, now) {
  return `${app}:${feature}:${userId || 'anon'}:${utcDay(now)}`;
}

/** Drop yesterday's keys so the map does not grow one entry per user per day forever. */
function sweep(now) {
  const today = utcDay(now);
  for (const key of counters.keys()) {
    if (!key.endsWith(today)) counters.delete(key);
  }
}

export function callsToday({ app, feature, userId, now = new Date() }) {
  return counters.get(counterKey(app, feature, userId, now)) || 0;
}

/** Test hook. */
export function _resetCounters() {
  counters.clear();
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Models fenced their JSON in ``` more often than not before structured
 * output existed; some free-tier providers still do. Accept either.
 */
export function parseJson(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  let text = String(raw).trim();
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) text = fence[1];
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try { return JSON.parse(text.slice(start, end + 1)); } catch { /* fall through */ }
    }
    return null;
  }
}

function provenance(source, extra = {}) {
  return {
    source,
    reason: null,
    model: null,
    provider: null,
    cached: false,
    callsToday: 0,
    cap: null,
    ...extra,
  };
}

/**
 * @param {object} opts
 * @param {string} opts.app          owning app id (routing row + usage bucket)
 * @param {string} opts.feature      short feature name, e.g. 'review', 'quickadd'
 * @param {string|null} opts.userId  the signed-in user; counts the cap per user
 * @param {string} opts.system       system prompt
 * @param {string} opts.user         user turn (usually JSON facts)
 * @param {object} [opts.schema]     { name, description, schema } → JSON mode, parsed
 * @param {(data:any)=>boolean} [opts.validate]  extra check on the parsed object; false → fallback
 * @param {() => any} opts.fallback  deterministic answer when the model is not used
 * @param {number} [opts.maxCallsPerDay]
 * @param {number} [opts.timeoutMs]
 * @param {number} [opts.temperature]
 * @param {number} [opts.maxTokens]
 * @param {Date}   [opts.now]        injectable clock (tests)
 * @param {object} [opts.ai]         injectable aiService (tests)
 */
export async function runAIFeature(opts) {
  const {
    app,
    feature,
    userId = null,
    system,
    user,
    schema = null,
    validate = null,
    fallback,
    maxCallsPerDay = DEFAULT_MAX_CALLS_PER_DAY,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    temperature = 0.2,
    maxTokens = null,
    now = new Date(),
    ai = aiService,
  } = opts || {};

  if (!app || !feature) throw new TypeError('runAIFeature: app and feature are required');
  if (typeof fallback !== 'function') throw new TypeError(`runAIFeature(${app}:${feature}): a fallback() is required`);

  const settle = async (source, reason, extra = {}) => {
    const data = await fallback();
    return { data, provenance: provenance(source, { reason, ...extra }) };
  };

  sweep(now);
  const key = counterKey(app, feature, userId, now);
  const used = counters.get(key) || 0;
  if (used >= maxCallsPerDay) {
    logger.info({ app, feature, used, cap: maxCallsPerDay }, '[aiFeature] daily cap reached; fallback');
    return settle('fallback', 'cap', { callsToday: used, cap: maxCallsPerDay });
  }

  const caller = internalCaller({ appId: app, userId, feature });
  const label = `${caller.appId}:${caller.feature}`;

  let content;
  try {
    counters.set(key, used + 1);
    content = await withTimeout(
      ai.callAI(user, {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        useAppConfig: true,
        appName: caller.appId,
        feature: caller.feature,
        userId: caller.userId,
        temperature,
        ...(maxTokens ? { maxTokens } : {}),
        ...(schema ? { responseFormat: { type: 'json_schema', json_schema: schema } } : {}),
      }),
      timeoutMs,
      label
    );
  } catch (err) {
    logger.warn({ app, feature, err: err?.message }, '[aiFeature] model call failed; fallback');
    return settle('fallback', 'unavailable', { callsToday: used + 1, cap: maxCallsPerDay });
  }

  const info = ai.lastProviderInfo || {};
  const meta = {
    model: info.model || null,
    provider: info.provider || null,
    cached: Boolean(info.cached),
    callsToday: used + 1,
    cap: maxCallsPerDay,
  };

  let data = content;
  if (schema) {
    data = parseJson(content);
    if (data == null) {
      logger.warn({ app, feature }, '[aiFeature] unparseable model output; fallback');
      return settle('fallback', 'unparseable', meta);
    }
  } else if (typeof data === 'string') {
    data = data.trim();
    if (!data) return settle('fallback', 'empty', meta);
  }

  if (validate && !validate(data)) {
    logger.warn({ app, feature }, '[aiFeature] model output failed validation; fallback');
    return settle('fallback', 'invalid', meta);
  }

  return { data, provenance: provenance('model', meta) };
}

/**
 * The GraphQL shape, for reference. The live declaration is `type AIProvenance`
 * in `graphql/shared/typeDefs.js`; do NOT import this constant from a
 * typeDefs file — this module pulls in aiService and crypto-vault, and
 * tools/gql-arg-audit.mjs imports every typeDefs standalone with no env.
 */
export const AI_PROVENANCE_SDL = `
  """Where an AI-assisted result came from. \`source: "fallback"\` means no model was consulted."""
  type AIProvenance {
    source: String!
    reason: String
    model: String
    provider: String
    cached: Boolean!
    callsToday: Int!
    cap: Int
  }
`;

export default { runAIFeature, callsToday, parseJson, utcDay, AI_PROVENANCE_SDL };
