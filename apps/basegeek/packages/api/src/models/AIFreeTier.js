import mongoose from 'mongoose';
import { getAIGeekConnection } from '../config/database.js';
import { upstreamStatusOf } from '../services/aiFailureEnvelope.js';
import { PROVIDER_IDS } from '../config/aiProviders.js';

/**
 * Per-row health memory (R130, 2026-09-06).
 *
 * The free tiers move under us. Groq retired `llama-3.1-8b-instant`, Together
 * stopped serving its `-Free` Llama, OpenRouter's `:free` slugs were recycled —
 * and every one of those rows sat in this collection with `isFree: true`,
 * getting picked first, forever, because nothing here remembered that the last
 * call to it 404'd. StartGeek's Ask spent the whole 3 s GlanceIntent budget
 * walking dead models before landing on the one provider that still answers.
 *
 * `health` is that memory. It is written fire-and-forget by
 * `aiService.markFreeTierFailure` / `markFreeTierSuccess` and read at
 * selection time; `coolingUntil` in the future takes the row out of the
 * candidate list. Rows are never deleted for being dead — the aiGeek UI lists
 * this collection, and a row that vanished would look like a config loss.
 */
const aiFreeTierHealthSchema = new mongoose.Schema({
  consecutiveFailures: { type: Number, default: 0 },
  lastFailureAt: { type: Date, default: null },
  lastFailureCode: { type: String, default: null },
  lastSuccessAt: { type: Date, default: null },
  coolingUntil: { type: Date, default: null }
}, { _id: false });

const aiFreeTierSchema = new mongoose.Schema({
  provider: {
    type: String,
    required: true,
    enum: PROVIDER_IDS
  },
  modelId: {
    type: String,
    required: true
  },
  isFree: {
    type: Boolean,
    default: false
  },
  /**
   * The one hand a human still gets on a row (the status page's override
   * drawer, `setCatalogOverride`, 2026-09-11).
   *
   *   `deny`  — never a candidate. Selection and `/models/alive` skip the row,
   *             the re-probe sweep does not spend a call on it, and a live
   *             probe verdict does not revive it. A pin that names it degrades
   *             to `auto` (`pin_denied`).
   *   `allow` — the cooling memory no longer applies: the row stays a
   *             candidate even while the probe has it marked dead. The rare
   *             exception, not a workflow.
   *   `null`  — the row lives and dies by what the job observes (default).
   *
   * This is the per-row escape hatch the deleted Catalog tab's Free checkbox
   * and Restore-defaults used to stand in for — everything else about a row
   * is observed and belongs to the job.
   */
  override: {
    type: String,
    enum: ['deny', 'allow', null],
    default: null
  },
  /**
   * How well this row answers the catalog probe, as of `probedAt`.
   *
   *   `structured` — returned parseable JSON with the fields the probe asked
   *                  for. Every AI feature in the suite asks for structured
   *                  output, so these are ranked first within a provider.
   *   `basic`      — answered with text, but not JSON. Kept and ranked lower;
   *                  nothing is excluded for being small, it is ranked.
   *   `null`       — never probed (a row written by hand or by an older sync).
   *
   * This is the whole replacement for the 30-term `NOT_GENERAL` name regex
   * that used to decide which models were "general assistants" (2026-09-07).
   */
  fitness: {
    type: String,
    enum: ['structured', 'basic'],
    default: null
  },
  /**
   * Whether the vendor's own listing says this row will accept an image as
   * input, for routing `need: 'vision:*'` (`aiNeedResolver.js`).
   *
   *   `true`  — the listing declared image among its input modalities
   *   `false` — the listing declared input modalities and image was not one
   *   `null`  — this provider's listing does not say (unknown)
   *
   * This field breaks the pattern every other `null` in this schema follows,
   * and deliberately so. Everywhere else here, `null` means "unmeasured, so
   * do not penalize it" — `fitness: null` still gets picked and probed,
   * `quality.score: null` still ranks mid-band, `latency.p50Ms: null` still
   * gets a fair shot at `fast` work. That principle exists because ranking an
   * unmeasured row as *bad* would keep it from ever being selected, and
   * therefore from ever being measured — a trap worth going out of the way to
   * avoid for a quality signal.
   *
   * Vision is not a quality signal. Sending an image to a row that cannot
   * accept one is not a worse answer to rank below a better one — it is a
   * malformed request that the provider's API rejects outright, every time.
   * There is no "try it and see how it does" here; there is only "does the
   * request succeed at all". So `aiNeedResolver.js` treats `null` exactly like
   * `false` for the `vision` task: both mean "do not send this row an image".
   *
   * The honest consequence, worth stating plainly: only OpenRouter's listing
   * exposes `architecture.input_modalities` today (`aiCatalogDiscovery.js`'s
   * `openRouterCatalog`). None of groq, cerebras, together, cloudflare,
   * gemini, cohere, ollama or llmgateway's `/models` responses say anything
   * about input modality, so every row from those eight providers carries
   * `null` here indefinitely and is simply never a `vision` candidate — not
   * because it cannot see images, but because nothing here has ever been told
   * whether it can. That is a real limit of what those vendors' listings tell
   * us, the same shape as "only groq and together send rate-limit headers" a
   * few fields down, not a bug in this field or its resolver.
   */
  acceptsImageInput: {
    type: Boolean,
    default: null
  },
  probedAt: {
    type: Date,
    default: null
  },
  freeLimits: {
    requestsPerMinute: { type: Number, default: 0 },
    requestsPerDay: { type: Number, default: 0 },
    tokensPerMinute: { type: Number, default: 0 },
    tokensPerDay: { type: Number, default: 0 },
    audioSecondsPerHour: { type: Number, default: 0 },
    audioSecondsPerDay: { type: Number, default: 0 }
  },
  /**
   * What the provider's own `x-ratelimit-remaining-*` / `-reset-*` headers said
   * on our last real call to this row (`aiService.recordObservedLimits`).
   * Debounced to one write per row per minute.
   *
   * `freeLimits` above is the ceiling the same headers reported; this is the
   * live reading. Selection skips a row whose `remainingRequests` is 0 while
   * `resetAt` is still in the future — the one case where we know, rather than
   * guess, that a call would 429.
   *
   * Providers that send no rate-limit headers at all (Gemini, Cloudflare,
   * Cohere, Ollama Cloud) simply never populate this.
   */
  observed: {
    remainingRequests: { type: Number, default: null },
    remainingTokens: { type: Number, default: null },
    resetAt: { type: Date, default: null },
    seenAt: { type: Date, default: null }
  },
  currentUsage: {
    requestsToday: { type: Number, default: 0 },
    tokensToday: { type: Number, default: 0 },
    audioSecondsToday: { type: Number, default: 0 },
    lastResetDate: { type: Date, default: Date.now }
  },
  /**
   * How long this row takes to answer, measured.
   *
   * The probe has always timed itself — `probeRow` returns `ms` and the job
   * logs it — and then thrown the number away. That left the routing layer
   * with no measured notion of speed at all, so "is this model fast" was
   * answered by `aiModelCapabilitiesService` looking for "8b" or "instant" in
   * the model's *name*. On 2026-09-15 that rated a retired 405B slug
   * state-of-the-art and gave the only model that actually served no rating at
   * all, because its name matched no pattern.
   *
   * `recentMs` is a bounded FIFO of the last few successful probes and `p50Ms`
   * its median — a median because one 9-second outlier on a busy vendor should
   * not reclassify a row that is usually quick. Only successful probes are
   * recorded: a timeout measures the timeout, not the model.
   */
  latency: {
    recentMs: { type: [Number], default: () => [] },
    p50Ms: { type: Number, default: null },
    measuredAt: { type: Date, default: null }
  },
  /**
   * How well this row answered the golden set — six questions with known
   * answers, scored by code (services/aiGoldenSet.js).
   *
   * `fitness` says a row can emit JSON. This says whether what it emits is any
   * good, which is a different question and the one that actually matters. On
   * 2026-09-16, with only `fitness` to go on, twenty-two rows tied for
   * `structured:fast` and the work went to a model that answered English
   * prompts in Arabic.
   *
   * `score` is null until a row has been asked — "unmeasured", which the
   * resolver must be able to tell from "measured and bad", or a new model could
   * never be picked and so never be scored.
   *
   * `offLanguage` is kept separately because "replied in another script" is a
   * fact worth seeing in the console, not just a low number.
   */
  quality: {
    score: { type: Number, default: null },
    byClass: { type: Map, of: Number, default: () => new Map() },
    offLanguage: { type: Boolean, default: false },
    answered: { type: Number, default: 0 },
    scoredAt: { type: Date, default: null }
  },
  health: {
    type: aiFreeTierHealthSchema,
    default: () => ({})
  },
  notes: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Compound index to ensure unique free tier per model
aiFreeTierSchema.index({ provider: 1, modelId: 1 }, { unique: true });

/* ──────────────────────────── measured latency ──────────────────────────── */

/** How many probe timings a row keeps. Enough for a median, small enough to follow the model. */
export const LATENCY_SAMPLES = 5;

/**
 * The weight classes `need` is expressed in, as measured milliseconds.
 *
 * `fast` is "a person is waiting": the doc's budget is ≤2s, which is the
 * difference between FitnessGeek's inline dish estimate feeling instant and
 * feeling broken. `deep` is a background job where slow is fine.
 */
export const WEIGHT_FAST_MS = 2000;
export const WEIGHT_BALANCED_MS = 6000;

/** Median of a small list. Even counts take the lower middle — no interpolating two samples. */
export function medianOf(values = []) {
  const sorted = [...values].filter(n => Number.isFinite(n)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/**
 * The row's `latency` block after one more successful timing.
 *
 * Returned rather than applied so the probe can put it straight into the same
 * `$set` as the rest of its verdict — one write per row, not two.
 */
export function withLatencySample(existing = {}, ms, now = Date.now()) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const recentMs = [...(existing?.recentMs || []), ms].slice(-LATENCY_SAMPLES);
  return { recentMs, p50Ms: medianOf(recentMs), measuredAt: new Date(now) };
}

/**
 * Which weight class a measured p50 falls in, or `null` when nothing has been
 * measured yet. `null` is not "slow" — it is "unknown", and the resolver must
 * treat the two differently or an unmeasured row can never be picked.
 */
export function weightClassOf(p50Ms) {
  if (!Number.isFinite(p50Ms)) return null;
  if (p50Ms <= WEIGHT_FAST_MS) return 'fast';
  if (p50Ms <= WEIGHT_BALANCED_MS) return 'balanced';
  return 'deep';
}

/**
 * How long a quality score is trusted before the row is worth re-asking.
 *
 * Scores decay because a vendor can swap what sits behind a slug without
 * renaming it — which is the same reason the catalog is re-probed rather than
 * trusted forever.
 */
export const QUALITY_FRESH_MS = 14 * 24 * 60 * 60 * 1000;

/** Has this row been scored recently enough to rank on? */
export function qualityIsFresh(quality, now = Date.now()) {
  if (!quality || typeof quality.score !== 'number') return false;
  const at = quality.scoredAt ? new Date(quality.scoredAt).getTime() : 0;
  return Number.isFinite(at) && (now - at) < QUALITY_FRESH_MS;
}

/* ───────────────────────── failure classification ───────────────────────── */

/** Cooling applied to a row after one hard failure. */
export const FREE_TIER_COOLDOWN_MS = 6 * 60 * 60 * 1000;
/** Cooling applied once a row has failed hard three times in a row. */
export const FREE_TIER_LONG_COOLDOWN_MS = 24 * 60 * 60 * 1000;
/** How many consecutive hard failures earn the long cooldown. */
export const FREE_TIER_LONG_COOLDOWN_AFTER = 3;

/**
 * A "hard" failure is one where retrying the same provider/model tomorrow is
 * pointless: the model is gone, the slug was recycled, or the credential is
 * refused. A 429, a 500 or a timeout is *not* hard — those are the provider
 * having a bad minute, and the existing rate-limit and rotation cooling already
 * handle them.
 */
export const HARD_FAILURE_STATUSES = new Set([400, 401, 403, 404, 410]); // 410: Ollama Cloud says "retired" with Gone

/**
 * The vendors' own words for the same four situations. Kept as one expression
 * because the probe script and the selection path must agree on what "dead"
 * means, or a row the probe marks would be revived by the next call.
 */
export const HARD_FAILURE_PATTERN =
  /model_not_found|does not exist|no longer|not found|wrong api key|unauthorized/i;

/**
 * The subset of hard failures that mean **the model is gone**, as opposed to
 * "this call was refused".
 *
 * The distinction is the whole point. A 401 or 403 is a credential or
 * entitlement problem: the model still exists and the row should be cooled and
 * retried. A 404 or 410 means the vendor withdrew the slug, and no amount of
 * waiting brings it back — retrying it every 30 days forever is just a slower
 * way of failing.
 *
 * Observed 2026-09-15: `google/gemini-2.0-flash-exp:free`,
 * `meta-llama/llama-3.1-70b-instruct:free` and
 * `nousresearch/hermes-3-llama-3.1-405b:free` were all still in our catalog and
 * all 404-ing, with OpenRouter replying in as many words: "This model is
 * unavailable for free. The paid version is available now." Every pin to them
 * fell back silently, all day, and nothing learned.
 */
export const RETIREMENT_CODES = new Set(['http_404', 'http_410', 'model_not_found']);

/** `true` when this failure means the model no longer exists. */
export const isRetirement = (code) => RETIREMENT_CODES.has(code);

/**
 * Classify a thrown provider error for the free-tier health record.
 *
 * @param {Error} error
 * @returns {{hard: boolean, code: string, status: number|null}}
 *   `code` is a short, credential-free token safe to store and to print — a
 *   status (`http_404`) where the provider gave one, otherwise an error class.
 *   Never the provider's body: those carry org ids, entitlement detail and
 *   vendor-redacted key fragments (see services/aiFailureEnvelope.js).
 */
export function classifyFreeTierFailure(error) {
  const status = upstreamStatusOf(error);
  const message = String(error?.message || '');

  if (status) {
    return { hard: HARD_FAILURE_STATUSES.has(status), code: `http_${status}`, status };
  }

  if (HARD_FAILURE_PATTERN.test(message)) {
    return { hard: true, code: 'model_not_found', status: null };
  }

  if (/timeout|etimedout|econnaborted|aborted/i.test(message)) {
    return { hard: false, code: 'timeout', status: null };
  }
  if (/econnrefused|enotfound|eai_again|socket hang up|network error/i.test(message)) {
    return { hard: false, code: 'network', status: null };
  }
  if (/rate limit|quota|too many requests/i.test(message)) {
    return { hard: false, code: 'rate_limited', status: null };
  }

  return { hard: false, code: 'unknown', status: null };
}

/** `true` when this row should not be picked right now. */
export function isFreeTierCooling(health, now = Date.now()) {
  const until = health?.coolingUntil;
  if (!until) return false;
  const at = until instanceof Date ? until.getTime() : new Date(until).getTime();
  return Number.isFinite(at) && at > now;
}

// Use aiGeek database connection
const aiGeekConnection = getAIGeekConnection();
const AIFreeTier = aiGeekConnection.model('AIFreeTier', aiFreeTierSchema);

export default AIFreeTier;
