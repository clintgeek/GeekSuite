/**
 * fitnessgeek `LoginStreak` — the single source of truth for the field set and
 * for the streak arithmetic.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Two independent writers persist this document into the same `loginstreaks`
 * collection in the `fitnessgeek` MongoDB database:
 *
 *   1. fitnessgeek's REST backend — apps/fitnessgeek/backend/src/routes/streakRoutes.js
 *   2. basegeek's GraphQL gateway — apps/basegeek/packages/api/src/graphql/fitnessgeek/resolvers.js
 *
 * Mongoose runs in strict mode by default: an unknown path in a `$set` is
 * dropped silently, not rejected. Two hand-synced copies of a schema is
 * therefore a data-loss hazard, not a style complaint — see
 * `DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md`.
 *
 * The two copies were byte-identical when this module was created (2026-09-05)
 * apart from the connection binding and basegeek's `requireUser` guard, so
 * promoting them here was a pure refactor: no field added, removed, retyped or
 * re-defaulted, and no index changed.
 *
 * WHAT MOVED, AND WHAT DIDN'T
 * ---------------------------
 * The *instance method* `recordLogin` moved. It is identical on both sides, it
 * mutates four declared paths, and a divergence in it would corrupt a user's
 * streak rather than merely throw — so it belongs with the fields, exactly as
 * the plan's "fields, indexes, virtuals, instance methods → the shared module"
 * rule says.
 *
 * The *static* `getOrCreateStreak` did NOT move. basegeek's copy opens with
 * `requireUser(userId)` (fail-closed ownership, mirroring its bujogeek service
 * layer) and fitnessgeek's does not, because every fitnessgeek caller is
 * already past auth. Statics do not affect `schema.paths`, so the two writers
 * are free to disagree about them and neither is blocked on the other. Each
 * app declares its own in its own model file.
 *
 * WHY THE ARITHMETIC IS AN EXPORTED FUNCTION
 * ------------------------------------------
 * `recordLogin` calls `this.save()`, so asserting its behaviour needs a live
 * connection. `applyLoginToStreak` is the same arithmetic with the save taken
 * out: it mutates a plain object (or a mongoose document) and returns it, so
 * fitnessgeek's hermetic test suite — no Mongo, no Redis, no network — can
 * assert the consecutive/reset/same-day branches directly. Same reason
 * `bloodPressure.js` exports `classifyBloodPressure` rather than inlining the
 * closure: a behaviour assertion needs something to call.
 *
 * KNOWN QUIRK — THE TIMESTAMPS ARE DECLARED TWICE
 * -----------------------------------------------
 * The definition declares `created_at` and `updated_at` explicitly AND the
 * options pass `timestamps: true`, which makes mongoose add `createdAt` and
 * `updatedAt` on top. Four timestamp paths, two of them maintained by hand
 * (`recordLogin` stamps `updated_at`) and two by mongoose. Both shipped copies
 * do this and the extra pair is on disk, so it moved verbatim. Untangling it
 * is a migration, not a refactor.
 *
 * KNOWN QUIRK — `user_id` IS INDEXED TWICE
 * ----------------------------------------
 * The path carries `index: true` and the schema also calls
 * `.index({ user_id: 1 })`. Same key, same options, so MongoDB creates one
 * index and mongoose may log a duplicate-index warning. Both shipped copies do
 * it; removing one is a behaviour-neutral cleanup that still doesn't belong in
 * a consolidation commit, because it would make this schema stop being
 * byte-equivalent to what is deployed. Left alone deliberately.
 *
 * WHY `mongoose` IS A PARAMETER, AND WHY THIS MODULE IS CJS
 * --------------------------------------------------------
 * Same reasons as `weight.js`, `bloodPressure.js` and `userSettings.js`: the
 * consumers own their own mongoose instances (a `Schema` built by instance A
 * fails `instanceof` inside instance B's `Connection.model()`), and a CJS
 * module with a literal `module.exports = { … }` is statically readable by
 * Node's ESM→CJS interop from both of them with no build step.
 */

/**
 * The field definitions, as a plain object literal.
 *
 * @param {import('mongoose')} mongoose - the caller's mongoose instance.
 * @returns {Object} a definition object suitable for `new mongoose.Schema(...)`
 */
function loginStreakDefinition(mongoose) {
  if (!mongoose || !mongoose.Schema) {
    throw new TypeError(
      '@geeksuite/schemas/fitnessgeek/loginStreak: pass your own mongoose instance'
    );
  }

  return {
    user_id: {
      type: String,
      required: true,
      index: true
    },
    current_streak: {
      type: Number,
      default: 0
    },
    longest_streak: {
      type: Number,
      default: 0
    },
    last_login_date: {
      type: Date,
      default: null
    },
    streak_start_date: {
      type: Date,
      default: null
    },
    created_at: {
      type: Date,
      default: Date.now
    },
    updated_at: {
      type: Date,
      default: Date.now
    }
  };
}

const loginStreakOptions = {
  timestamps: true
};

/**
 * The streak arithmetic, lifted verbatim out of `recordLogin` so it can be
 * asserted without a database.
 *
 * "Today" is the *server's local* calendar day, stored as UTC midnight so it
 * lines up with the UTC-midnight dates read back elsewhere. Truncating the
 * instant with `setUTCHours` instead would roll to tomorrow after ~18:00
 * US-Central, which is why it is built from the local Y/M/D. Do not
 * "simplify" that into `toUtcMidnight(new Date())` — they are not the same
 * function for an instant argument.
 *
 * Branches, in the order they are evaluated:
 *   - no previous login, or the previous login was yesterday → increment
 *     (and seed `streak_start_date` when this is day 1)
 *   - a previous login that is neither yesterday nor today → reset to 1
 *   - a previous login that IS today → neither branch fires; the streak is
 *     left alone and only the timestamps are re-stamped
 *
 * @param {Object} streak - a `LoginStreak` document, or any object carrying
 *   the same five paths. Mutated in place.
 * @param {Date} [now] - injectable clock, for tests. Defaults to `new Date()`.
 * @returns {Object} the same object, for chaining.
 */
function applyLoginToStreak(streak, now = new Date()) {
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

  const lastLogin = streak.last_login_date ? new Date(streak.last_login_date) : null;
  if (lastLogin) {
    lastLogin.setUTCHours(0, 0, 0, 0); // Start of day (already UTC midnight)
  }

  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  // Check if this is a consecutive day
  if (!lastLogin || lastLogin.getTime() === yesterday.getTime()) {
    // Consecutive day - increment streak
    streak.current_streak += 1;

    // Update longest streak if current is longer
    if (streak.current_streak > streak.longest_streak) {
      streak.longest_streak = streak.current_streak;
    }

    // Set streak start date if this is the first day
    if (streak.current_streak === 1) {
      streak.streak_start_date = today;
    }
  } else if (lastLogin && lastLogin.getTime() !== today.getTime()) {
    // Not consecutive - reset streak
    streak.current_streak = 1;
    streak.streak_start_date = today;
  }

  streak.last_login_date = today;
  streak.updated_at = new Date();

  return streak;
}

/**
 * Attach the shared instance methods. Split out so a consumer that builds the
 * schema by hand (a migration script, say) can still get them.
 *
 * @param {import('mongoose').Schema} schema
 */
function attachLoginStreakMethods(schema) {
  // Method to record a login and update streak
  schema.methods.recordLogin = async function recordLogin() {
    applyLoginToStreak(this);
    return await this.save();
  };
}

/**
 * Build a fresh `LoginStreak` schema — index and instance methods included.
 *
 * Statics are deliberately NOT attached here: `getOrCreateStreak` differs
 * between the two writers (basegeek guards it with `requireUser`) and statics
 * do not affect `schema.paths`, so they cannot cause the strict-mode data loss
 * this module exists to prevent. Each app declares its own.
 *
 * @param {import('mongoose')} mongoose - the caller's mongoose instance.
 * @returns {import('mongoose').Schema}
 */
function createLoginStreakSchema(mongoose) {
  const schema = new mongoose.Schema(loginStreakDefinition(mongoose), loginStreakOptions);

  // Index for efficient queries (duplicate of the path-level flag; see header).
  schema.index({ user_id: 1 });

  attachLoginStreakMethods(schema);

  return schema;
}

module.exports = {
  applyLoginToStreak,
  attachLoginStreakMethods,
  loginStreakDefinition,
  loginStreakOptions,
  createLoginStreakSchema,
};
