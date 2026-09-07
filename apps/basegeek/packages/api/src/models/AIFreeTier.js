import mongoose from 'mongoose';
import { getAIGeekConnection } from '../config/database.js';
import { upstreamStatusOf } from '../services/aiFailureEnvelope.js';

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
    enum: ['anthropic', 'groq', 'gemini', 'together', 'cohere', 'openrouter', 'cerebras', 'cloudflare', 'ollama', 'llmgateway']
  },
  modelId: {
    type: String,
    required: true
  },
  isFree: {
    type: Boolean,
    default: false
  },
  freeLimits: {
    requestsPerMinute: { type: Number, default: 0 },
    requestsPerDay: { type: Number, default: 0 },
    tokensPerMinute: { type: Number, default: 0 },
    tokensPerDay: { type: Number, default: 0 },
    audioSecondsPerHour: { type: Number, default: 0 },
    audioSecondsPerDay: { type: Number, default: 0 }
  },
  currentUsage: {
    requestsToday: { type: Number, default: 0 },
    tokensToday: { type: Number, default: 0 },
    audioSecondsToday: { type: Number, default: 0 },
    lastResetDate: { type: Date, default: Date.now }
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
