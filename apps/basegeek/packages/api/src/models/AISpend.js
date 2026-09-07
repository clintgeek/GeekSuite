import mongoose from 'mongoose';
import { getAIGeekConnection } from '../config/database.js';
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
  costUsd: { type: Number, default: 0 }
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

export default AISpend;
