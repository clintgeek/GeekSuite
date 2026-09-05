import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';
import { requireUser } from '../ownership.js';

// The field set, the index and the `recordLogin` instance method live in
// @geeksuite/schemas so that this model and fitnessgeek's REST copy
// (apps/fitnessgeek/backend/src/models/LoginStreak.js) cannot drift. Both
// write the `loginstreaks` collection in the same database, and mongoose
// strict mode silently drops paths one side doesn't know about. See the shared
// module's header and DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md.
//
// Do NOT add fields here. Add them to the shared module (and to typeDefs.js if
// they should cross GraphQL); the tripwire tests in both suites fail if this
// model stops matching the shared definition.
//
// Default import + destructure: the shared module is CommonJS (no build step,
// `require`-able and `import`-able by both consumers), and this is the interop
// form that works identically under Node ESM and jest's
// --experimental-vm-modules.
import loginStreakSchemaModule from '@geeksuite/schemas/fitnessgeek/loginStreak';

const { createLoginStreakSchema } = loginStreakSchemaModule;

const fitnessConn = getAppConnection('fitnessgeek');

const loginStreakSchema = createLoginStreakSchema(mongoose);

// The ownership guard stays here, not in the shared module: this gateway fails
// closed on an unscoped query, fitnessgeek's callers are already past auth, and
// statics don't affect `schema.paths`, so the two writers are free to disagree.

// Static method to get or create login streak for user
loginStreakSchema.statics.getOrCreateStreak = async function(userId) {
  requireUser(userId);
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

export default fitnessConn.model('LoginStreak', loginStreakSchema);
