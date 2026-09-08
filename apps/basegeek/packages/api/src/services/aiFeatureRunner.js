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
/**
 * The default cap for the HTTP door, which is a different animal from the
 * in-process one.
 *
 * In-process features are one-shot assists — a review draft, a food parse, a
 * suggestion — and 20 a day per user is a generous hobby bound. An
 * out-of-process consumer is a whole app: a StoryGeek session is dozens of GM
 * turns in an evening, and 20 would end the story mid-scene. The real ceilings
 * for those are the free tier's own rate limits and, for money, the governor
 * (`AI_PAID_PER_DAY_USD`). This number exists so a runaway loop is bounded,
 * not to ration a feature.
 *
 * A routing row may lower (or raise) it per app: `AIAppConfig.dailyCap`.
 */
export const DEFAULT_HTTP_MAX_CALLS_PER_DAY = 200;
// Never let a feature inherit a provider's 4000-token default: Cloudflare's
// fast llama kept generating past its JSON and took 15 s+ (2026-09-06 live).
export const DEFAULT_MAX_TOKENS = 600;

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

/** A cap-bucket segment: short, trimmed, and never allowed to be a novel. */
const MAX_QUOTA_KEY = 64;

/**
 * Which bucket this call's daily cap counts against.
 *
 * Normally the credential's `userId`. But a **service API key has no
 * session**: `callerIdentity` gives a key caller the key's *owner* (the admin
 * who minted it), which is an artefact of how the key was created and not the
 * person making the request — so every StoryGeek player would share one
 * bucket, and the first evening's play would spend the app's whole day.
 *
 * `quotaKey` is the opaque string a trusted backend sends to split that
 * bucket: a user id, a story id, whatever it uses to mean "one of my
 * sessions". It wins when it is present, because the only caller that sends it
 * is the HTTP door, and the door passes it *only* for a credential with no
 * session and no named user — that judgement needs `caller.source` and belongs
 * where it can see it (`POST /api/ai/feature`).
 *
 * It is used for **nothing else**. It is not an identity, it is not resolved
 * to a user, it is not logged as one, it does not reach `callAI`, and it does
 * not touch `AIUsage`, `AISpend` or a conversation's ownership. It is a
 * counter segment, and a request body may name a counter segment because the
 * worst a liar gets is a fresh quota — which the free tier's own rate limits
 * and the paid governor already bound. That is the entire threat model, and it
 * is why this cannot be the pattern for anything else a body says.
 */
function quotaBucket(userId, quotaKey) {
  if (typeof quotaKey === 'string') {
    const trimmed = quotaKey.trim().slice(0, MAX_QUOTA_KEY);
    if (trimmed) return trimmed;
  }
  return userId || null;
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

/**
 * Some free-tier providers (seen live: Cloudflare's llama 3.3) return the
 * structured output wrapped under the schema's name — `{"Smoke":{"word":…}}`
 * for a schema named `Smoke`. Unwrap that single-key envelope so feature
 * validators see the object they asked for.
 */
export function unwrapSchemaEnvelope(data, schema) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const keys = Object.keys(data);
  const name = schema?.name;
  if (keys.length === 1 && name && keys[0] === name && data[name] && typeof data[name] === 'object') {
    return data[name];
  }
  return data;
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
    // What one call cost, in dollars, from the same figure `AISpend` booked
    // (`aiService.updateStats` → `lastProviderInfo.costUsd`). `null` means
    // "nobody told us", which is not the same as free — a free row books 0.
    costUsd: null,
    // Which legacy field, routing-row value or degradation produced the route
    // this call took (`aiRoute.resolveRoute`). Useful in exactly one place:
    // explaining to a player why their pinned model was not used.
    hints: [],
    ...extra,
  };
}

/**
 * runFeatureCore — everything `runAIFeature` does except call `fallback()`.
 *
 * Split out in Phase 2 so the same contract can be served over HTTP. The
 * runner's four obligations (routing row, daily cap, fail-soft, provenance)
 * were only available to code running *inside* the gateway; fitnessgeek and
 * storygeek called `/api/ai/call` with their own axios wrappers, no fallback,
 * and 500'd to the user on any failure. `POST /api/ai/feature` is this
 * function with an envelope, so an out-of-process consumer gets the same
 * deal — and, crucially, a **200** with `ok: false` instead of a 500, because
 * the deterministic fallback for an out-of-process feature lives out there
 * with the feature.
 *
 * The one difference from the wrapper: a refusal is `{ ok: false, reason }`
 * with `provenance.source: 'none'`, not `'fallback'`. Nothing fell back here;
 * that is the caller's next move.
 *
 * `fallback` is not required and not called. Everything else — the counter
 * key (`app:feature:userId:day`), the schema unwrap, the validate hook, the
 * reasons (`cap | unavailable | unparseable | empty | invalid`) — is
 * byte-for-byte what the wrapper had.
 *
 * @param {object} opts  as `runAIFeature`, minus `fallback`, plus:
 * @param {Array<{role: string, content: string}>} [opts.messages]  a whole
 *        conversation instead of one `system`/`user` pair. The HTTP door
 *        accepts this; in-process callers never needed it.
 * @param {string} [opts.conversationId]  enables a sticky pick when the
 *        routing row asks for one (`AIAppConfig.sticky`).
 * @param {string} [opts.provider]  half of an explicit pin — see below.
 * @param {string} [opts.model]     the other half. Both or neither.
 * @param {string} [opts.quotaKey]  cap-bucket segment used ONLY when the
 *        credential names no user. See `quotaBucket`.
 * @returns {Promise<{ok: boolean, data: any, reason: string|null, provenance: object}>}
 */
export async function runFeatureCore(opts) {
  const {
    app,
    feature,
    userId = null,
    quotaKey = null,
    system,
    user,
    messages = null,
    schema = null,
    validate = null,
    conversationId = null,
    // An explicit pin, which for the HTTP door is StoryGeek's player picker:
    // a player chose a model for their story and that choice is a `pin` on
    // that story's turns. Both fields or neither — a provider with no model
    // would silently become "that provider's default", which is not what a
    // picker means. A pin whose row is cooling or gone degrades to the sticky
    // auto pick and says so in `provenance.hints` (`pin_unavailable`), which
    // is what lets StoryGeek show the player a notice instead of a failed
    // turn.
    provider = null,
    model = null,
    maxCallsPerDay = DEFAULT_MAX_CALLS_PER_DAY,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    temperature = 0.2,
    maxTokens = DEFAULT_MAX_TOKENS,
    now = new Date(),
    ai = aiService,
  } = opts || {};

  if (!app || !feature) throw new TypeError('runFeatureCore: app and feature are required');
  const pinned = typeof provider === 'string' && provider && typeof model === 'string' && model
    ? { provider, model }
    : null;

  const refuse = (reason, extra = {}) => ({
    ok: false,
    data: null,
    reason,
    provenance: provenance('none', { reason, ...extra }),
  });

  sweep(now);
  const key = counterKey(app, feature, quotaBucket(userId, quotaKey), now);
  const used = counters.get(key) || 0;
  if (used >= maxCallsPerDay) {
    logger.info({ app, feature, used, cap: maxCallsPerDay }, '[aiFeature] daily cap reached');
    return refuse('cap', { callsToday: used, cap: maxCallsPerDay });
  }

  const caller = internalCaller({ appId: app, userId, feature });
  const label = `${caller.appId}:${caller.feature}`;

  // Either the caller's own conversation or the one-shot system/user pair
  // every in-gateway feature sends. `prompt` stays the last user turn, which
  // is what the cache subject and the adapters that only read a string want.
  const turns = Array.isArray(messages) && messages.length > 0
    ? messages
    : [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
  const prompt = [...turns].reverse().find(m => m?.role === 'user')?.content ?? user ?? '';

  let content;
  try {
    counters.set(key, used + 1);
    content = await withTimeout(
      ai.callAI(prompt, {
        messages: turns,
        // No routing switch. "Nothing at all" is `auto` reading the app's
        // routing row (DOCS/AIGEEK_FRONT_DOOR.md §1), which is exactly what
        // `useAppConfig: true` used to mean here and no longer has to say.
        appName: caller.appId,
        feature: caller.feature,
        // The credential's user, and only the credential's. `quotaKey` never
        // reaches this object: it counts a cap and means nothing else.
        userId: caller.userId,
        ...(conversationId ? { conversationId } : {}),
        ...(pinned || {}),
        temperature,
        maxTokens,
        ...(schema ? { responseFormat: { type: 'json_schema', json_schema: schema } } : {}),
      }),
      timeoutMs,
      label
    );
  } catch (err) {
    logger.warn({ app, feature, err: err?.message }, '[aiFeature] model call failed');
    return refuse('unavailable', { callsToday: used + 1, cap: maxCallsPerDay });
  }

  const info = ai.lastProviderInfo || {};
  const meta = {
    model: info.model || null,
    provider: info.provider || null,
    cached: Boolean(info.cached),
    callsToday: used + 1,
    cap: maxCallsPerDay,
    costUsd: info.costUsd ?? null,
    hints: Array.isArray(info.hints) ? info.hints : [],
  };

  let data = content;
  if (schema) {
    data = unwrapSchemaEnvelope(parseJson(content), schema);
    if (data == null) {
      logger.warn({ app, feature }, '[aiFeature] unparseable model output');
      return refuse('unparseable', meta);
    }
  } else if (typeof data === 'string') {
    data = data.trim();
    if (!data) return refuse('empty', meta);
  }

  if (validate && !validate(data)) {
    logger.warn({ app, feature }, '[aiFeature] model output failed validation');
    return refuse('invalid', meta);
  }

  return { ok: true, data, reason: null, provenance: provenance('model', meta) };
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
  const { app, feature, fallback } = opts || {};
  if (!app || !feature) throw new TypeError('runAIFeature: app and feature are required');
  if (typeof fallback !== 'function') throw new TypeError(`runAIFeature(${app}:${feature}): a fallback() is required`);

  const core = await runFeatureCore(opts);
  if (core.ok) return { data: core.data, provenance: core.provenance };

  // The wrapper's whole job: turn "no model answer" into the feature's
  // deterministic one, and say so. `source` becomes `fallback` rather than
  // `none` because something *did* answer — just not a model.
  return {
    data: await fallback(),
    provenance: { ...core.provenance, source: 'fallback' },
  };
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

export default { runAIFeature, runFeatureCore, callsToday, parseJson, unwrapSchemaEnvelope, utcDay, AI_PROVENANCE_SDL };
