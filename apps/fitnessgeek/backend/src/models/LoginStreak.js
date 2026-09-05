import mongoose from 'mongoose';
import { createLoginStreakSchema } from '@geeksuite/schemas/fitnessgeek/loginStreak';

// The field set, the index and the `recordLogin` instance method live in
// @geeksuite/schemas so that this model and basegeek's GraphQL copy
// (apps/basegeek/packages/api/src/graphql/fitnessgeek/models/LoginStreak.js)
// cannot drift. Both write the `loginstreaks` collection in the same database,
// and mongoose strict mode silently drops paths one side doesn't know about —
// see the shared module's header and DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md.
//
// `recordLogin` moved because it is identical on both sides and a divergence
// in it would corrupt a user's streak. The arithmetic is also exported as
// `applyLoginToStreak(streak, now)` so it can be asserted without a database.
//
// Do NOT add fields here. Add them to the shared module; the tripwire tests in
// both suites fail if this model stops matching it.
const loginStreakSchema = createLoginStreakSchema(mongoose);

// Statics stay app-side. basegeek's copy of this one opens with
// `requireUser(userId)` — its fail-closed ownership posture — and this side's
// callers (src/routes/streakRoutes.js) are already past auth, so the two
// writers deliberately disagree. Statics don't affect `schema.paths`, so that
// disagreement cannot cause the strict-mode data loss the shared module exists
// to prevent.

// Static method to get or create login streak for user
loginStreakSchema.statics.getOrCreateStreak = async function(userId) {
  let streak = await this.findOne({ user_id: userId });

  if (!streak) {
    streak = new this({
      user_id: userId,
      current_streak: 0,
      longest_streak: 0,
      last_login_date: null,
      streak_start_date: null
    });
    await streak.save();
  }

  return streak;
};

export default mongoose.model('LoginStreak', loginStreakSchema);
