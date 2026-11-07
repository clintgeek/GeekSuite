/**
 * aiFeatureRunner — the one door every in-gateway AI feature walks through.
 *
 * The night-2 features (todogeek review draft, fitnessgeek quick-add,
 * notegeek suggestions, bookgeek what-next / metadata drafts — startgeek's
 * morning brief was removed 2026-09-25) share four obligations that are easy
 * to get slightly different each time:
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
 * **Attaching an image** (`ai/adapters/imageContent.js` has the full shape
 * and rationale): a `messages[]` entry's `content` may be a content-parts
 * array instead of a plain string, carrying `{type:'image', mediaType,
 * data}` alongside `{type:'text', text}`. This function does not need to
 * know that to carry it — `messages` was already opaque cargo all the way to
 * `aiService.callAI` before images existed, and still is; the one thing this
 * function *does* do differently is derive its own `prompt` fallback with
 * `textOnly()` so an image never ends up base64-in-a-cache-key.
 *
 * Usage:
 *
 *   const result = await runAIFeature({
 *     app: 'todogeek', feature: 'review', userId,
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
import { textOnly } from './ai/adapters/imageContent.js';
import AIFeatureQuota from '../models/AIFeatureQuota.js';

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

// The durable counter lives in `AIFeatureQuota` (one document per
// `app:feature:bucket:YYYY-MM-DD`, claimed atomically — see `claimSlot`).
// This map is two things, neither of them the source of truth:
//   - the last count this process saw per key, which is what the synchronous
//     `callsToday()` reports;
//   - the counter itself while the store cannot be written (see `claimSlot`
//     for why that degrades rather than refuses).
// Until 2026-11-06 this map WAS the cap, and every restart (every push to
// main restarts the fleet) handed every user a fresh day.
const counters = new Map();

/**
 * How long a claim may take before the store is treated as unavailable.
 * Mongoose buffers commands while disconnected (10 s by default), and a
 * feature whose whole budget is 6 s cannot spend that waiting on a counter.
 */
export const QUOTA_STORE_TIMEOUT_MS = 1500;

/** Keys whose last claim came from the in-process fallback, not the store. */
const memoryClaims = new Set();

/** A pending `_resetCounters()` store wipe; claims wait for it. */
let resetting = null;

/**
 * Every durable key this process has claimed on in the last few days — what
 * `_resetCounters` deletes. Scoped rather than `deleteMany({})` because test
 * workers share one Mongo, and one suite's reset must not wipe another's
 * counters mid-test. Swept in `sweep` to three days, so it stays small.
 */
const touched = new Set();

/** The durable store. `null` = in-process only (`_setQuotaStore`). */
let quotaStore = AIFeatureQuota;

/**
 * Test seam: `null` counts in process only — for a suite running under fake
 * timers, where a Mongo round trip never settles — and no argument restores
 * the real store. Returns the previous store.
 */
export function _setQuotaStore(store = AIFeatureQuota) {
  const previous = quotaStore;
  quotaStore = store;
  return previous;
}
const TOUCHED_KEEP_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Resolved needs, briefly.
 *
 * `aiService.resolveNeed` reads the free-tier catalog out of Mongo on every
 * call. That is fine for one-shot features and wrong for a fan-out: NoteGeek's
 * Compose issues up to eight MAP calls in parallel plus a REDUCE, which without
 * this is nine identical catalog queries to answer one question.
 *
 * The TTL is short because the catalog is a live thing — rows cool, rate limits
 * are observed, the discovery run rewrites it every 24h — and a stale pick that
 * outlived a cooldown is worse than a fresh query. Sixty seconds is long enough
 * that one fan-out resolves once, which is the case this exists for, and short
 * enough that nothing else notices.
 *
 * A useful side effect, not a guarantee: every call in one fan-out gets the
 * same row, so a compose's extracts come back in one voice rather than several.
 */
const NEED_CACHE_TTL_MS = 60_000;
const needCache = new Map();

/**
 * The rows a need resolves to, best first — a short list, not one pick, so a
 * pick that fails at the provider falls to the next row that ALSO meets the
 * need (see the call loop below). An aiService without
 * `resolveNeedCandidates` (a test double, an older build) gives a one-row list.
 */
async function resolvePicks(ai, need) {
  if (typeof ai.resolveNeedCandidates === 'function') {
    const list = await ai.resolveNeedCandidates(need);
    return Array.isArray(list) ? list.filter((p) => p?.provider && p?.modelId) : [];
  }
  const one = await ai.resolveNeed?.(need);
  return one?.provider && one?.modelId ? [one] : [];
}

async function resolvePick(ai, need, nowMs = Date.now()) {
  const hit = needCache.get(need);
  if (hit && nowMs - hit.at < NEED_CACHE_TTL_MS) return hit.promise;

  // The PROMISE is cached, not the answer. A fan-out starts all its calls in
  // the same tick, so caching the answer leaves every one of them to miss and
  // query anyway — the first version of this cached the result and a two-chunk
  // compose still read the catalog twice. Sharing the in-flight resolution is
  // what makes "resolve once per fan-out" true rather than nearly true.
  const promise = resolvePicks(ai, need);
  needCache.set(need, { at: nowMs, promise });
  // A failed resolution must not be remembered for a minute: the next caller
  // deserves a fresh attempt, and the caller's own catch decides what a
  // failure costs.
  promise.catch(() => {
    if (needCache.get(need)?.promise === promise) needCache.delete(need);
  });
  return promise;
}

/** Test seam: the cache is process-wide and would otherwise leak between suites. */
export function _resetNeedCache() {
  needCache.clear();
}

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
  for (const key of memoryClaims) {
    if (!key.endsWith(today)) memoryClaims.delete(key);
  }
  const oldest = utcDay(new Date(new Date(now).getTime() - TOUCHED_KEEP_MS));
  for (const key of touched) {
    if (key.slice(-10) < oldest) touched.delete(key);
  }
}

/**
 * The last count this process saw for the key — synchronous, so it cannot ask
 * the store. Exact for any key this process has claimed on today; 0 for one it
 * has not touched since boot.
 */
export function callsToday({ app, feature, userId, now = new Date() }) {
  return counters.get(counterKey(app, feature, userId, now)) || 0;
}

/**
 * Test hook. Clears the in-process mirror at once and the durable counters
 * asynchronously; returns the wipe's promise, and every claim waits on it, so
 * the older suites that call this without `await` stay correct.
 */
export function _resetCounters() {
  counters.clear();
  memoryClaims.clear();
  const ids = [...touched];
  touched.clear();
  const wipe = Promise.resolve()
    .then(() => (ids.length && quotaStore ? quotaStore.deleteMany({ _id: { $in: ids } }) : null))
    .catch((err) => logger.warn({ err: err?.message }, '[aiFeature] could not clear the durable cap counters'));
  resetting = wipe;
  wipe.finally(() => { if (resetting === wipe) resetting = null; });
  return wipe;
}

function withStoreDeadline(promise) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`cap store timed out after ${QUOTA_STORE_TIMEOUT_MS}ms`)), QUOTA_STORE_TIMEOUT_MS);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/**
 * Take one slot of today's cap, atomically: `count < cap` and `$inc` are one
 * write, so N concurrent calls cannot all read "one left" and all go.
 *
 * Returns `{ ok: true, count }` (count INCLUDING this claim) or
 * `{ ok: false, count }` (the count that refused it).
 *
 * **When the store cannot be written, this degrades to the in-process
 * counter, with a warning, rather than refusing.** The judgement: this cap is
 * a runaway-loop bound on a mostly free path, not the money guard. Paid
 * spend is governed separately by `AISpendBudget`'s reservation, which
 * already fails closed when its ledger cannot be written — so the dollars are
 * protected either way. Failing closed here would turn a Mongo blip into
 * every AI feature in the suite answering with its fallback, to protect free
 * quota the providers' own rate limits already bound. The degraded counter
 * is per-process and resets on restart: the old behaviour, for exactly as
 * long as the store is down.
 */
async function claimSlot({ key, app, feature, bucket, day, cap }) {
  if (!(cap > 0)) return { ok: false, count: counters.get(key) || 0 };
  if (!quotaStore) return claimInMemory(key, cap);
  if (resetting) await resetting;
  touched.add(key);
  try {
    const dayStart = new Date(`${day}T00:00:00.000Z`);
    const expireAt = new Date(dayStart.getTime() + 2 * 24 * 60 * 60 * 1000);
    const claim = (upsert) => withStoreDeadline(Promise.resolve().then(() => quotaStore.findOneAndUpdate(
      { _id: key, count: { $lt: cap } },
      {
        $inc: { count: 1 },
        ...(upsert ? { $setOnInsert: { app, feature, bucket, day, expireAt } } : {}),
      },
      { upsert, new: true }
    ).lean()));
    let doc;
    try {
      doc = await claim(true);
    } catch (err) {
      // E11000 means the document exists and its count is at the cap (the
      // filter missed, so the upsert tried to insert a second `_id`), or a
      // concurrent first-of-the-day insert won. A plain conditional `$inc`
      // tells the two apart.
      if (err?.code !== 11000) throw err;
      doc = await claim(false);
    }
    if (doc) {
      memoryClaims.delete(key);
      counters.set(key, doc.count);
      return { ok: true, count: doc.count };
    }
    const current = await withStoreDeadline(Promise.resolve().then(() => quotaStore.findById(key).select('count').lean()));
    const count = current?.count ?? cap;
    counters.set(key, count);
    return { ok: false, count };
  } catch (err) {
    logger.warn({ app, feature, err: err?.message }, '[aiFeature] cap store unavailable — counting in process for now');
    return claimInMemory(key, cap);
  }
}

function claimInMemory(key, cap) {
  const used = counters.get(key) || 0;
  if (used >= cap) return { ok: false, count: used };
  counters.set(key, used + 1);
  memoryClaims.add(key);
  return { ok: true, count: used + 1 };
}

/** Give back a claim whose call was never dispatched. Never rejects. */
async function releaseSlot(key) {
  const mirrored = counters.get(key) || 0;
  if (mirrored > 0) counters.set(key, mirrored - 1);
  if (memoryClaims.has(key)) return;
  try {
    await withStoreDeadline(Promise.resolve().then(() => quotaStore.updateOne(
      { _id: key, count: { $gt: 0 } },
      { $inc: { count: -1 } }
    )));
  } catch (err) {
    // The slot stays spent until the day rolls over: errs toward refusing.
    logger.warn({ key, err: err?.message }, '[aiFeature] could not release an unused cap claim');
  }
}

/**
 * `callAIWithInfo` against whatever `ai` this run was handed: `{ content,
 * info }` for THIS call. The real service has the method; an injected double
 * may only have `callAI` and a hand-set `lastProviderInfo`, which is read from
 * that double — never from the singleton, which stopped writing one on
 * 2026-11-06 because concurrent calls overwrote each other's copy. Defined
 * here rather than imported because a dozen suites mock `aiService.js` with a
 * default export only.
 */
async function callWithInfo(ai, prompt, config) {
  if (typeof ai?.callAIWithInfo === 'function') return ai.callAIWithInfo(prompt, config);
  const content = await ai.callAI(prompt, config);
  return { content, info: ai?.lastProviderInfo || {} };
}

/**
 * Run `work(signal)` under a deadline that CANCELS it, not merely stops
 * waiting for it.
 *
 * This was `Promise.race([promise, timeout])` until 2026-11-06, which answered
 * the caller on time and left the call running behind it: `callAI` walked on
 * to the next free row and then to the governed PAID attempt, wrote health and
 * a sticky repin and booked spend — for an answer nobody would read. Now the
 * deadline aborts the signal `callAI` checks before every attempt and hands to
 * the adapter's HTTP request. `outer` is the caller's own signal (the HTTP
 * door's client hanging up); either one firing cancels the call.
 */
function withTimeout(work, ms, label, outer = null) {
  const controller = new AbortController();
  let timer;
  let onOuter;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    if (outer) {
      onOuter = () => {
        controller.abort();
        reject(new Error(`${label} aborted by the caller`));
      };
      if (outer.aborted) onOuter();
      else outer.addEventListener('abort', onOuter, { once: true });
    }
  });
  const running = Promise.resolve().then(() => work(controller.signal));
  // The losing side of the race still settles — with the abort error, once the
  // signal lands. That rejection is expected and has nobody to report to.
  running.catch(() => {});
  return Promise.race([running, deadline]).finally(() => {
    clearTimeout(timer);
    if (outer && onOuter) outer.removeEventListener('abort', onOuter);
  });
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
    // (`aiService.updateStats` → the call's own `info.costUsd`). `null` means
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
 * @param {string} [opts.need]  what this call NEEDS, e.g. `'prose:deep'`,
 *        resolved against the live catalog (`aiNeedResolver`). See below.
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
    /**
     * What this call needs, as a capability rather than a model id —
     * `'prose:deep'`, `'structured:fast'`, `'vision+structured:balanced'`.
     *
     * Until 2026-09-22 only the HTTP door could say this; an in-process
     * feature got whatever the app's routing row's rotation happened to
     * offer. That is not a theoretical gap. NoteGeek's Compose — multi-
     * document synthesis, about the hardest thing here asks of a model — was
     * routed to `groq/allam-2-7b`, a 7B model the need resolver's own header
     * already documents as having answered an English prompt in Arabic. It
     * produced a document that repeated one invented line 38 times until it
     * hit the token ceiling, and shipped it as a success.
     *
     * An explicit pin still wins: a pin is a person's choice and a need is a
     * description. An unresolvable need degrades to the ordinary routing walk
     * rather than failing the call — the catalog is a live thing and "nothing
     * measurably meets this today" is a reason to fall back, not to refuse.
     */
    need = null,
    /**
     * The caller's own AbortSignal — the HTTP door passes one that fires when
     * the client hangs up. Combined with this run's timeout in `withTimeout`.
     */
    signal = null,
    /**
     * Whether `app` is an identity we issued (callerIdentity's `trustedApp`).
     * `false` — a JWT that named its own app, an unattributed caller — gets no
     * paid-first and no paid step from that app's row: the row is someone
     * else's budget. In-process callers leave the default.
     */
    appTrusted = true,
    /**
     * Refuse rather than fall back when `need` resolves to nothing. For the
     * HTTP door's `vision` needs: a text-only model handed an image answers
     * confidently about nothing, so "no vision row today" is a refusal
     * (`detail: 'need_unresolved'`), not an `auto` walk to a blind model.
     */
    requireNeed = false,
    maxCallsPerDay = DEFAULT_MAX_CALLS_PER_DAY,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    temperature = 0.2,
    maxTokens = DEFAULT_MAX_TOKENS,
    now = new Date(),
    ai = aiService,
  } = opts || {};

  if (!app || !feature) throw new TypeError('runFeatureCore: app and feature are required');
  const explicitPin = typeof provider === 'string' && provider && typeof model === 'string' && model
    ? { provider, model }
    : null;

  const refuse = (reason, extra = {}) => ({
    ok: false,
    data: null,
    reason,
    provenance: provenance('none', { reason, ...extra }),
  });

  sweep(now);
  const bucket = quotaBucket(userId, quotaKey);
  const key = counterKey(app, feature, bucket, now);
  // Claimed BEFORE need resolution, so a capped caller costs no catalog read
  // and `cap` still outranks `need_unresolved`; released below when the call
  // is refused before it dispatches.
  const slot = await claimSlot({ key, app, feature, bucket: bucket || 'anon', day: utcDay(now), cap: maxCallsPerDay });
  if (!slot.ok) {
    logger.info({ app, feature, used: slot.count, cap: maxCallsPerDay }, '[aiFeature] daily cap reached');
    return refuse('cap', { callsToday: slot.count, cap: maxCallsPerDay });
  }
  // `used` keeps its old meaning: the calls before this one.
  const used = slot.count - 1;

  // A need is resolved only when nothing was pinned outright, and only ever
  // best-effort: a resolver that throws must not cost the caller their call.
  let needInfo = null;
  let needPin = null;
  let needPicks = [];
  if (!explicitPin && typeof need === 'string' && need.trim()) {
    try {
      needPicks = await resolvePick(ai, need);
      const pick = needPicks[0];
      if (pick?.provider && pick?.modelId) {
        needPin = { provider: pick.provider, model: pick.modelId };
        needInfo = { asked: need, resolved: true, provider: pick.provider, model: pick.modelId, why: pick.why || [] };
      } else {
        needInfo = { asked: need, resolved: false, why: ['nothing in the catalog measurably meets this need'] };
      }
    } catch (err) {
      logger.warn({ app, feature, need, err: err?.message }, '[aiFeature] need resolution failed');
      needInfo = { asked: need, resolved: false, why: ['the need resolver was unavailable'] };
    }
  }

  // Before the cap is counted: a refusal for want of a qualifying model is not
  // a call.
  if (requireNeed && needInfo && !needPin) {
    await releaseSlot(key);
    return {
      ok: false,
      data: null,
      reason: 'unavailable',
      detail: 'need_unresolved',
      provenance: provenance('none', { reason: 'unavailable', callsToday: used, cap: maxCallsPerDay, need: needInfo }),
    };
  }

  const pinned = explicitPin || needPin;

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
  // `content` may now be a content-parts array carrying an attached image
  // (see `ai/adapters/imageContent.js` for the shape — the body-composition
  // intake feature is the first caller of this). `prompt` is never the wire
  // format for that image; it is only a fallback string for cache-key
  // derivation and token estimation upstream in `aiService.callAI`, so
  // `textOnly` strips any image part rather than letting one reach either as
  // raw base64. The actual image still travels intact inside `turns`/
  // `messages`, untouched by this function.
  const lastUserContent = [...turns].reverse().find(m => m?.role === 'user')?.content;
  const prompt = lastUserContent != null ? textOnly(lastUserContent) : (user ?? '');

  // One attempt per resolved need pick, while the time spent is still under
  // one timeout. A need resolves to a pin, and a pin is ONE attempt inside
  // aiService — so a best pick failing at the provider failed the feature,
  // for as long as the failure lasted: 2026-09-24, every NoteGeek Compose
  // hit the same OpenRouter row whose upstream (Nvidia) was out of capacity,
  // a soft failure that deliberately cools nothing. Falling to the next row
  // that also meets the need fixes that without dropping to a row that
  // doesn't. The time budget keeps a SLOW failure from tripling the caller's
  // wait: fast failures (a 502 in milliseconds) fall through, a timeout ends
  // it.
  const attemptPins = needPin && !explicitPin
    ? needPicks.map((p) => ({ provider: p.provider, model: p.modelId }))
    : [pinned || null];
  // Paid-first (2026-09-24): an app whose row names a paid model tries it
  // BEFORE the need's free picks. `paidOnly` makes that one call plan only
  // the governed paid attempt — a budget refusal or an unpriced model fails
  // it in milliseconds — so the fallback is still the need's own qualifying
  // rows (vision rows for a vision need), not the app's general free walk.
  // A call with no need already goes `auto`, which plans paid-first itself.
  let paidFirst = null;
  if (needPin && !explicitPin && appTrusted !== false) {
    try {
      paidFirst = (await ai.paidFirstFor?.(caller.appId)) ?? null;
    } catch {
      paidFirst = null;
    }
    if (paidFirst) attemptPins.unshift({ paidOnly: true });
  }
  const startedAt = Date.now();
  const failedPicks = [];

  let content;
  // This call's own metadata, handed back with its content. It was read off
  // the shared `ai.lastProviderInfo` after the loop until 2026-11-06, which a
  // concurrent call could overwrite in between (NoteGeek's Compose fan-out is
  // nine of these at once).
  let info = {};
  for (let i = 0; i < attemptPins.length; i += 1) {
    const attemptPin = attemptPins[i];
    try {
      ({ content, info } = await callOnce(attemptPin));
      if (needPin && attemptPin?.provider) ai.noteNeedSuccess?.(attemptPin.provider, attemptPin.model);
      if (attemptPin?.paidOnly && needInfo) {
        needInfo = { ...needInfo, provider: paidFirst.provider, model: paidFirst.model, paidFirst: true, why: ['the app\'s paid-first model'] };
      } else if (i > 0 && needInfo) {
        needInfo = {
          ...needInfo,
          provider: attemptPin.provider,
          model: attemptPin.model,
          fellBackFrom: failedPicks,
        };
      }
      break;
    } catch (err) {
      failedPicks.push(attemptPin?.paidOnly
        ? `paid:${paidFirst.provider}/${paidFirst.model}`
        : attemptPin ? `${attemptPin.provider}/${attemptPin.model}` : 'auto');
      if (needPin && attemptPin?.provider) {
        // Demote the row for this need for a while, and drop the cached
        // resolution so the NEXT call re-ranks now rather than in a minute:
        // a row timing out is not a blip the next nine calls should repeat.
        ai.noteNeedFailure?.(attemptPin.provider, attemptPin.model);
        needCache.delete(need);
      }
      // A timeout ends it outright (withTimeout's own error), and so does
      // having already spent a timeout's worth on fast failures.
      const timedOut = /timed out after|aborted by the caller/.test(String(err?.message || ''));
      const outOfTime = timedOut || Date.now() - startedAt >= timeoutMs;
      if (i === attemptPins.length - 1 || outOfTime) {
        logger.warn({ app, feature, err: err?.message, tried: failedPicks }, '[aiFeature] model call failed');
        return refuse('unavailable', { callsToday: used + 1, cap: maxCallsPerDay });
      }
      logger.warn({ app, feature, err: err?.message, failed: failedPicks.at(-1) }, '[aiFeature] need pick failed, trying the next row that meets the need');
    }
  }

  async function callOnce(attemptPin) {
    return withTimeout((callSignal) => callWithInfo(ai, prompt, {
        messages: turns,
        // No routing switch. "Nothing at all" is `auto` reading the app's
        // routing row (DOCS/ARCHIVE/AIGEEK_FRONT_DOOR.md §1), which is exactly what
        // `useAppConfig: true` used to mean here and no longer has to say.
        appName: caller.appId,
        appTrusted,
        feature: caller.feature,
        // The credential's user, and only the credential's. `quotaKey` never
        // reaches this object: it counts a cap and means nothing else.
        userId: caller.userId,
        ...(conversationId ? { conversationId } : {}),
        ...(attemptPin || {}),
        temperature,
        maxTokens,
        ...(schema ? { responseFormat: { type: 'json_schema', json_schema: schema } } : {}),
        signal: callSignal,
      }),
      timeoutMs,
      label,
      signal
    );
  }

  const meta = {
    model: info.model || null,
    provider: info.provider || null,
    cached: Boolean(info.cached),
    callsToday: used + 1,
    cap: maxCallsPerDay,
    costUsd: info.costUsd ?? null,
    hints: Array.isArray(info.hints) ? info.hints : [],
    // `length` means the model was still talking when it hit `maxTokens`, so
    // the answer is cut off. A caller that can tell a complete answer from a
    // truncated one needs to be told which it got.
    finishReason: info.finishReason ?? null,
    ...(needInfo ? { need: needInfo } : {}),
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

// `AI_PROVENANCE_SDL` — removed 2026-09-19 (aiGeek review §2). It was a stale
// reference copy of the GraphQL shape; its own comment said not to import it
// from a typeDefs file, and nothing ever did. It had also drifted from the
// live declaration — missing `costUsd` and `hints` — so it was wrong as well
// as unused. The live declaration is `type AIProvenance` in
// `graphql/shared/typeDefs.js`. See DOCS/AIGEEK_REVIEW_2026-09.md §2.

export default { runAIFeature, runFeatureCore, callsToday, parseJson, unwrapSchemaEnvelope, utcDay };
