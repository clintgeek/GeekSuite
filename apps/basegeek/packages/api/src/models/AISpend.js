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
  refusals: { type: Number, default: 0 },
  /**
   * Calls whose cost nobody could tell us: no reported figure and no
   * trustworthy `AIPricing` row, on a model the free-tier catalog does not
   * list. Booked here and NOT as `costUsd: 0`, which is what they were until
   * 2026-11-06 — indistinguishable from a free call on every dashboard that
   * sums this collection. Such a call is rare by construction (the governor
   * refuses an unpriced paid attempt before it happens), which is exactly why
   * one appearing deserves to be seen.
   */
  costUnknown: { type: Number, default: 0 }
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
 * AISpendBudget — one document per UTC day: what the paid governor has
 * RESERVED for calls in flight, and what those calls SETTLED at.
 *
 * Added 2026-11-06 because the governor's check was a read: sum today's
 * `AISpend`, add the estimate, compare with the cap, call, and book the cost
 * afterwards. N paid attempts arriving together all read the same sum and all
 * passed. A reservation is one conditional `findOneAndUpdate` on this
 * document, so the check and the claim are a single atomic write and two
 * attempts cannot both take room that only one fits.
 *
 * Why a separate collection rather than a field on `AISpend`: those rows are
 * per (day, provider, app, feature) and every dashboard sums them; a day-total
 * row among them would appear as a phantom app. They stay exactly as they
 * were — this document is the governor's, and only the governor reads it.
 *
 * `_id` IS the day. Upserting on a secondary unique index races before the
 * index exists (mongoose builds indexes in the background), and two
 * documents for one day would split the budget in half; `_id` is unique from
 * the first write. `day` is repeated as a plain field for whoever reads it.
 */
const aiSpendBudgetSchema = new mongoose.Schema({
  _id: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
  day: { type: String },
  /** Estimates held by paid calls that have been cleared and not yet settled. */
  reservedUsd: { type: Number, default: 0 },
  /** What governed calls actually cost once settled (an unknown cost settles at its estimate). */
  settledUsd: { type: Number, default: 0 }
}, {
  timestamps: true,
  collection: 'aispendbudgets'
});

export const AISpendBudget = aiGeekConnection.model('AISpendBudget', aiSpendBudgetSchema);

/**
 * Floating-point slack on the cap comparison: five reservations of $0.01 sum
 * to 0.05000000000000001, and a cap of $0.05 is meant to admit all five.
 */
const CAP_EPSILON_USD = 1e-9;

/**
 * Reserve `estimateUsd` against today's paid cap, atomically.
 *
 * Two conditions, both evaluated inside the one update:
 *   reserved + settled + estimate ≤ cap   — governed spend, exact under concurrency
 *   reserved + external + estimate ≤ cap  — `externalSpentUsd` is today's
 *     `AISpend` total as the caller just read it, which also covers spend that
 *     never went through a reservation (booked before this document existed,
 *     or by a path that is not governed).
 *
 * @returns {Promise<{day: string, amountUsd: number}|null>} the reservation,
 *   or `null` when it does not fit. THROWS when the ledger cannot be written —
 *   the governor turns that into a refusal (fail closed).
 */
export async function reserveDailyBudget({ estimateUsd, perDayUsd, externalSpentUsd = 0, now = new Date() }) {
  const day = spendDay(now);
  const amount = Number(estimateUsd);
  if (!Number.isFinite(amount) || amount < 0) return null;
  const external = Number.isFinite(Number(externalSpentUsd)) ? Number(externalSpentUsd) : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(external)) return null;

  await AISpendBudget.updateOne(
    { _id: day },
    { $setOnInsert: { day, reservedUsd: 0, settledUsd: 0 } },
    { upsert: true }
  ).catch((err) => {
    // Two first-of-the-day reservations both tried the insert; one lost. The
    // document exists either way, which is all this step is for.
    if (err?.code !== 11000) throw err;
  });

  const limit = Number(perDayUsd) + CAP_EPSILON_USD;
  const doc = await AISpendBudget.findOneAndUpdate(
    {
      _id: day,
      $expr: {
        $and: [
          { $lte: [{ $add: ['$reservedUsd', '$settledUsd', amount] }, limit] },
          { $lte: [{ $add: ['$reservedUsd', external, amount] }, limit] }
        ]
      }
    },
    { $inc: { reservedUsd: amount } },
    { new: true }
  ).lean();
  return doc ? { day, amountUsd: amount } : null;
}

/**
 * Turn a reservation into spend: release the estimate, book the actual cost.
 * An unknown actual (`null`) keeps the whole estimate counted — the
 * conservative reading of "we were billed something".
 *
 * Never rejects. A settle that cannot be written leaves the estimate reserved
 * until the day rolls over, which errs toward refusing, not toward spending.
 */
export function settleDailyBudget(reservation, actualUsd = null) {
  if (!reservation) return Promise.resolve(null);
  const actual = actualUsd !== null && actualUsd !== undefined && Number.isFinite(Number(actualUsd))
    ? Number(actualUsd)
    : reservation.amountUsd;
  return AISpendBudget.updateOne(
    { _id: reservation.day },
    { $inc: { reservedUsd: -reservation.amountUsd, settledUsd: actual } }
  )
    .catch((err) => {
      logger.warn({ err, day: reservation.day }, '[AISpend] could not settle a paid reservation — it stays held until the day rolls over');
    })
    .then(() => reservation);
}

/** Give a reservation back (the call failed or was never made). Never rejects. */
export function releaseDailyBudget(reservation) {
  if (!reservation) return Promise.resolve(null);
  return AISpendBudget.updateOne(
    { _id: reservation.day },
    { $inc: { reservedUsd: -reservation.amountUsd } }
  )
    .catch((err) => {
      logger.warn({ err, day: reservation.day }, '[AISpend] could not release a paid reservation — it stays held until the day rolls over');
    })
    .then(() => reservation);
}

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
