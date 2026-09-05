import mongoose from 'mongoose';
import { toUtcMidnight } from '@geeksuite/utils/dates';
import { getAppConnection } from '../../shared/appConnections.js';
import { requireUser } from '../ownership.js';

// The field set, the unique `(user_id, date)` index, the options and — the
// carve-out for this pair — the recompute behind `updateFromLogs` live in
// @geeksuite/schemas so that this model and fitnessgeek's REST copy
// (apps/fitnessgeek/backend/src/models/DailySummary.js) cannot drift. Both
// point at the `dailysummaries` collection in the same database — this gateway
// through its `dailySummary` query, `refreshDailySummary` and every food-log
// mutation (seven call sites, all hot since 79b1b57), fitnessgeek through its
// logRoutes and summaryRoutes — and mongoose strict mode silently drops paths
// one side doesn't know about.
//
// This is the pair where that stopped being theoretical: `updateFromLogs`
// writes the WHOLE `totals` sub-document, and for one day THIS copy of the
// schema was missing `totals.net_carbs_grams`, so merely reading a day through
// the gateway erased the keto ring's number from the stored document. See the
// shared module's header and DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md (C1,
// PRE-1, fixed in 0cecb4a).
//
// Do NOT add fields here. Add them to the shared module (and to typeDefs.js if
// they should cross GraphQL); the tripwire tests in both suites fail if this
// model stops matching the shared definition.
//
// Default import + destructure: the shared module is CommonJS (no build step,
// `require`-able and `import`-able by both consumers), and this is the interop
// form that works identically under Node ESM and jest's
// --experimental-vm-modules.
import dailySummarySchemaModule from '@geeksuite/schemas/fitnessgeek/dailySummary';

const { createDailySummarySchema, updateDailySummaryFromLogs } = dailySummarySchemaModule;

const fitnessConn = getAppConnection('fitnessgeek');

const dailySummarySchema = createDailySummarySchema(mongoose);

// Static method to get or create daily summary.
//
// Stays app-side: it normalizes the date with `toUtcMidnight` from
// @geeksuite/utils, which is ESM-only and cannot be `require`d from the
// CommonJS shared package, and it opens with this gateway's `requireUser`
// guard. fitnessgeek's copy is this one without the guard.
dailySummarySchema.statics.getOrCreate = async function(userId, date) {
  requireUser(userId);
  const startDate = toUtcMidnight(date);
  startDate.setUTCHours(0, 0, 0, 0);

  let summary = await this.findOne({
    user_id: userId,
    date: startDate
  });

  if (!summary) {
    summary = new this({
      user_id: userId,
      date: startDate
    });
    await summary.save();
  }

  return summary;
};

// Static method to update daily summary from food logs.
//
// THE RECOMPUTE IS SHARED. This static is the only writer of `totals`,
// `meals` and `goals_met` on this side, fitnessgeek's twin is the only writer
// on that side, and both write the whole sub-document at once — so if the two
// implementations ever disagreed about a macro, one of them would quietly
// erase the other's number rather than fail. That is exactly what happened to
// `net_carbs_grams`, and it is why `updateDailySummaryFromLogs` is the second
// carve-out from the "statics stay app-side" rule after
// `FoodItem.findOrCreate`.
//
// What stays here: the `requireUser` guard, the two model lookups (this
// gateway's own fitnessgeek connection) and the date normalization, which
// cannot move — see `getOrCreate` above. The helper takes the
// already-normalized boundaries.
dailySummarySchema.statics.updateFromLogs = async function(userId, date) {
  requireUser(userId);

  const startDate = toUtcMidnight(date);
  startDate.setUTCHours(0, 0, 0, 0);

  const endDate = toUtcMidnight(date);
  endDate.setUTCHours(23, 59, 59, 999);

  return updateDailySummaryFromLogs({
    SummaryModel: this,
    FoodLogModel: fitnessConn.model('FoodLog'),
    UserSettingsModel: fitnessConn.model('UserSettings'),
    userId,
    startDate,
    endDate,
  });
};

// Static method to get summary for date range
dailySummarySchema.statics.getSummaryRange = async function(userId, startDate, endDate) {
  requireUser(userId);
  const start = toUtcMidnight(startDate);
  start.setUTCHours(0, 0, 0, 0);

  const end = toUtcMidnight(endDate);
  end.setUTCHours(23, 59, 59, 999);

  return await this.find({
    user_id: userId,
    date: { $gte: start, $lte: end }
  }).sort({ date: 1 });
};

export default fitnessConn.model('DailySummary', dailySummarySchema);
