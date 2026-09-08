import mongoose from 'mongoose';
import { getAIGeekConnection } from '../config/database.js';
import logger from '../lib/logger.js';
import { PROVIDER_IDS } from '../config/aiProviders.js';

/**
 * AISpend — the dollar ledger, one row per UTC day / provider / app / feature.
 *
 * `AIUsage` counts requests and tokens against a free-tier quota; it cannot
 * answer "what did this month cost", because a token is only a cost once you
 * know the price. This collection is the answer, written by
 * `aiService.updateStats` as a single `$inc` per call:
 *
 *   - OpenRouter reports `usage.cost` in dollars, exact, per response. That
 *     figure is used verbatim — no price table, no arithmetic, no drift.
 *   - Every other provider is priced from `AIPricing` (dollars per 1,000,000
 *     tokens) × the tokens the response reported.
 *   - A free row books `costUsd: 0` and still books its `calls`, so "free" is
 *     a number in the ledger rather than an absence from it.
 *
 * This replaced `aiService.providers[*].costPer1kTokens`, a per-provider
 * blended rate in a *different unit* from AIPricing's per-1M, which is exactly
 * the kind of table that is wrong six weeks after it is typed.
 *
 * Phase 2's paid governor and Phase 3's "dollars left of the $10" both read
 * this and nothing else.
 */
const aiSpendSchema = new mongoose.Schema({
  /** UTC calendar day, `YYYY-MM-DD`. A string so a day is a day in every timezone. */
  day: {
    type: String,
    required: true,
    match: /^\d{4}-\d{2}-\d{2}$/
  },
  provider: {
    type: String,
    required: true,
    enum: PROVIDER_IDS
  },
  /** Resolved app id (AIAppConfig.normalizeAppName), never a request body field. */
  app: {
    type: String,
    required: true,
    default: 'unknown'
  },
  /** Feature slice within the app, `''` when the caller named none. */
  feature: {
    type: String,
    required: true,
    default: ''
  },
  calls: { type: Number, default: 0 },
  costUsd: { type: Number, default: 0 },
  /**
   * How many times the governor **refused** a paid attempt in this bucket.
   *
   * Added for Phase 3's `paid_budget_hit` item. A refusal leaves no other
   * trace: the attempt is skipped and not queued, the feature falls to its
   * deterministic fallback, and the only record was a log line — so "the cap
   * bit yesterday" was a question nobody could answer without grepping a
   * container. It lives on the spend document because a refusal is a fact
   * about a day's money, and the day/provider/app/feature bucket is already
   * the shape that question is asked in.
   *
   * It is deliberately *not* part of `calls`: nothing happened.
   */
  refusals: { type: Number, default: 0 }
}, {
  timestamps: true
});

// One row per bucket; every write is an upsert `$inc` against this key.
aiSpendSchema.index({ day: 1, provider: 1, app: 1, feature: 1 }, { unique: true });

/** The UTC day key this ledger buckets by. */
export function spendDay(now = new Date()) {
  return new Date(now).toISOString().slice(0, 10);
}

const aiGeekConnection = getAIGeekConnection();
const AISpend = aiGeekConnection.model('AISpend', aiSpendSchema);

/**
 * Book one governor refusal against the day's bucket.
 *
 * Same shape and same guarantees as `aiService.recordSpend`, which is the
 * point: one upsert `$inc`, the E11000 retry (two refusals in the same
 * millisecond both find no document and both try to insert; the unique index
 * refuses the loser, and by then the document exists so the retry is a plain
 * `$inc`), and it **never rejects**. Failing a user's turn because we could
 * not write down that we declined to spend money on it would be absurd.
 *
 * It lives here rather than on the service so the governor's refusal path is
 * one call: `aiService` owns the decision, this collection owns the counter.
 *
 * @param {string} provider  the provider the refused attempt named
 * @param {string} appId     resolved app id, never a body field
 * @param {string} featureId feature slice, `''` when none
 * @param {Date}   [now]
 * @returns {Promise<object>} the bucket key, always
 */
export function recordRefusal(provider, appId, featureId, now = new Date()) {
  const key = { day: spendDay(now), provider, app: appId || 'unknown', feature: featureId || '' };
  const inc = { $inc: { refusals: 1 } };
  return AISpend.updateOne(key, inc, { upsert: true })
    .catch((err) => {
      if (err?.code !== 11000) throw err;
      return AISpend.updateOne(key, inc);
    })
    .catch((err) => {
      logger.debug({ err, ...key }, '[AISpend] failed to book a governor refusal');
    })
    .then(() => key);
}

export default AISpend;
