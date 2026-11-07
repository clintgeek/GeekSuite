import mongoose from 'mongoose';
import { getAIGeekConnection } from '../config/database.js';

/**
 * AIFeatureQuota — the per-feature daily cap counter `aiFeatureRunner` claims
 * against, one document per (app, feature, quota bucket, UTC day).
 *
 * Until 2026-11-06 this was an in-process `Map`: every restart reset every
 * cap (and the fleet restarts on every push to main), and a second process
 * would have had a second set of counters. A claim is now one conditional
 * `findOneAndUpdate` — `count < cap` and `$inc` in the same write — so N
 * concurrent calls cannot all read "one left" and all go.
 *
 * `_id` IS the key (`app:feature:bucket:YYYY-MM-DD`), for the same reason
 * `AISpendBudget` does it: an upsert on a secondary unique index races before
 * mongoose has built that index, and two documents for one key would double
 * the cap. `_id` is unique from the first write.
 *
 * `expireAt` carries a TTL: yesterday's counters are worth nothing, and a
 * TTL is cheaper than a sweep. Two days, so a day's document is never reaped
 * while that UTC day is still running anywhere.
 */
const aiFeatureQuotaSchema = new mongoose.Schema({
  _id: { type: String },
  app: { type: String },
  feature: { type: String },
  /** The cap bucket — a user id, a door `quotaKey`, or `anon`. Not an identity. */
  bucket: { type: String },
  /** UTC calendar day, `YYYY-MM-DD`. */
  day: { type: String },
  count: { type: Number, default: 0 },
  expireAt: { type: Date },
}, {
  timestamps: true,
  collection: 'aifeaturequotas',
});

aiFeatureQuotaSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

const AIFeatureQuota = getAIGeekConnection().model('AIFeatureQuota', aiFeatureQuotaSchema);

export default AIFeatureQuota;
