/**
 * fitnessgeek `UserSettings` — the single source of truth for the field set.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Two independent writers persist this document into the same `fitnessgeek`
 * MongoDB collection:
 *
 *   1. fitnessgeek's REST routes  — apps/fitnessgeek/backend/src/routes/settingsRoutes.js
 *   2. basegeek's GraphQL gateway — apps/basegeek/packages/api/src/graphql/fitnessgeek/resolvers.js
 *
 * They used to declare the schema separately, and the copies drifted. Mongoose
 * runs in strict mode by default, which silently DROPS unknown paths from a
 * `$set` instead of erroring — so a field that existed in one copy and not the
 * other was accepted by the API, logged as a success, and never written. That
 * is exactly what happened to `nutrition_goal.mode` and `nutrition_goal.keto`
 * in April 2026: the keto wizard saved through GraphQL, basegeek's copy did not
 * know the fields, and keto config evaporated on every save.
 *
 * Both models now build their schema from this module, so a field can only be
 * added in one place. `apps/fitnessgeek/DOCS/USER_SETTINGS_SCHEMA.md` carries
 * the field inventory and the history; the tripwire tests in both suites fail
 * if either model stops consuming this definition.
 *
 * HOW TO ADD A FIELD
 * ------------------
 * Add it here. Then, if it needs to be readable or writable over GraphQL, add
 * it to `FitnessUserSettings` / `FitnessUserSettingsInput` in
 * `apps/basegeek/packages/api/src/graphql/fitnessgeek/typeDefs.js`, and to the
 * `allowedFields` list in fitnessgeek's `settingsRoutes.js` if it should be
 * writable over REST. The schema alone is necessary but not sufficient — both
 * writers have their own allow-lists on top of it.
 *
 * WHY `mongoose` IS A PARAMETER
 * -----------------------------
 * The two consumers are separate workspace packages with their own mongoose
 * dependency ranges. They resolve to one physical install today, but a version
 * bump on either side would split them — and a `Schema` built by mongoose
 * instance A blows up `instanceof` checks inside instance B's
 * `Connection.model()`. Taking mongoose from the caller makes that impossible
 * and keeps mongoose out of this package's own dependency list.
 *
 * The one real dependency this package has is `@geeksuite/crypto-vault`, and
 * it is `require`d lazily — see the `garmin.password` section further down.
 *
 * This module is CommonJS on purpose: no build step, `require`-able and
 * `import`-able by either consumer, matching the precedent set by
 * `@geeksuite/crypto-vault`. Both fitnessgeek's backend and basegeek's api are
 * ESM as of 2026-09-05 and pick it up through Node's ESM→CJS interop —
 * fitnessgeek via a named import, basegeek via the default export. Same
 * arrangement as `@geeksuite/user`.
 */

/**
 * The field definitions, as a plain object literal.
 *
 * @param {import('mongoose')} mongoose - the caller's mongoose instance.
 * @returns {Object} a definition object suitable for `new mongoose.Schema(...)`
 */
function userSettingsDefinition(mongoose) {
  if (!mongoose || !mongoose.Schema) {
    throw new TypeError(
      '@geeksuite/schemas/fitnessgeek/userSettings: pass your own mongoose instance'
    );
  }
  const { Mixed, ObjectId } = mongoose.Schema.Types;

  return {
    user_id: {
      type: String,
      required: true,
      index: true
    },
    dashboard: {
      // Dashboard component visibility settings
      show_current_weight: {
        type: Boolean,
        default: true
      },
      show_blood_pressure: {
        type: Boolean,
        default: true
      },
      show_calories_today: {
        type: Boolean,
        default: true
      },
      show_login_streak: {
        type: Boolean,
        default: true
      },
      show_nutrition_today: {
        type: Boolean,
        default: true
      },
      show_garmin_summary: {
        type: Boolean,
        default: true
      },
      show_quick_actions: {
        type: Boolean,
        default: true
      },
      // Individual goal card settings
      show_weight_goal: {
        type: Boolean,
        default: true
      },
      show_nutrition_goal: {
        type: Boolean,
        default: true
      },
      // Card order settings
      card_order: {
        type: [String],
        default: [
          'current_weight',
          'blood_pressure',
          'calories_today',
          'login_streak',
          'nutrition_today',
          'garmin_summary',
          'quick_actions',
          'weight_goal',
          'nutrition_goal'
        ]
      }
    },
    // General app settings
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'light'
    },
    // Integrations
    garmin: {
      enabled: {
        type: Boolean,
        default: false
      },
      username: {
        type: String,
        default: undefined
      },
      password: {
        type: String,
        default: undefined
      },
      oauth1_token: {
        type: Mixed,
        default: undefined
      },
      oauth2_token: {
        type: Mixed,
        default: undefined
      },
      last_connected_at: {
        type: Date
      }
    },
    // InfluxDB integration (for users with direct access to Garmin data in InfluxDB)
    influxEnabled: {
      type: Boolean,
      default: false
    },
    // Health baselines for comparison
    healthBaselines: {
      weeklyHRV: {
        type: Number,
        default: null
      },
      restingHR: {
        type: Number,
        default: null
      },
      lastUpdated: {
        type: Date,
        default: null
      }
    },
    notifications: {
      enabled: {
        type: Boolean,
        default: true
      },
      daily_reminder: {
        type: Boolean,
        default: true
      },
      goal_reminders: {
        type: Boolean,
        default: true
      }
    },
    // Nutrition / calorie goal from Calorie Wizard
    nutrition_goal: {
      enabled: { type: Boolean, default: false },
      start_date: { type: Date },
      start_weight: { type: Number },
      target_weight: { type: Number },
      activity_level: { type: String },
      weight_change_rate: { type: Number },
      plan_type: { type: String, enum: ['standard', 'weekender', 'auto', 'fixed', 'weekly'], default: 'standard' },
      calorie_target_mode: { type: String, enum: ['auto', 'weekly', 'fixed', 'standard'], default: 'standard' },
      // Auto rules
      auto_base_calories: { type: Number },
      fixed_calories: { type: Number },
      activity_eatback_fraction: { type: Number, default: 0.6 },
      activity_eatback_cap_kcal: { type: Number, default: 500 },
      protein_g_per_lb_goal: { type: Number, default: 0.8 },
      fat_g_per_lb_goal: { type: Number, default: 0.35 },
      goal_weight_lbs: { type: Number },
      show_adjustment: { type: Boolean, default: true },
      daily_calorie_target: { type: Number },
      weekly_schedule: { type: [Number], default: undefined }, // 7 values Mon..Sun
      min_safe_calories: { type: Number },
      bmr: { type: Number },
      tdee: { type: Number },
      timeline_weeks: { type: Number },
      estimated_end_date: { type: Date },
      mode: {
        type: String,
        enum: ['standard', 'keto'],
        default: 'standard'
      },
      keto: {
        net_carb_limit_g: { type: Number, default: 20 },
        track_net_carbs: { type: Boolean, default: true },
        macro_split: {
          preset: {
            type: String,
            enum: ['classic', 'high_protein', 'lazy'],
            default: 'classic'
          },
          fat_pct:     { type: Number, default: 70 },
          protein_pct: { type: Number, default: 25 },
          carb_pct:    { type: Number, default: 5  }
        }
      }
    },
    // Weight goal
    weight_goal: {
      enabled: { type: Boolean, default: false },
      startWeight: { type: Number },
      targetWeight: { type: Number },
      startDate: { type: String }, // Store as YYYY-MM-DD string
      goalDate: { type: String }, // Store as YYYY-MM-DD string
      ratePerWeek: { type: Number }, // Signed: negative for loss, positive for gain
      lastRecalculated: { type: String }, // Store as YYYY-MM-DD string
      unit: { type: String, default: 'lbs' },
      is_active: { type: Boolean, default: true }
    },
    units: {
      weight: {
        type: String,
        enum: ['lbs', 'kg'],
        default: 'lbs'
      },
      height: {
        type: String,
        enum: ['ft', 'cm'],
        default: 'ft'
      }
    },
    // AI settings
    ai: {
      enabled: {
        type: Boolean,
        default: true
      },
      features: {
        // OFF by default, and deliberately the only one of the four that is.
        //
        // This flag is the opt-in for the natural-language quick-add
        // (DOCS/AI_IDEAS.md idea #2): the app's Settings toggle writes it, the
        // Food Log renders the "Describe a meal" entry point only when it is
        // true, and the gateway's `parseFoodEntry` resolver refuses to call a
        // model unless it is true. The suite's AI rules require every AI
        // feature to be off until somebody turns it on, so a `true` default
        // here would ship the feature enabled for every existing user — which
        // is why R115 had to park the opt-in in localStorage instead of using
        // this field. Flipping the default is what let the opt-in move back
        // to the server, where a person's choice follows them between
        // browsers. Do not "make it consistent" with its three siblings.
        natural_language_food_logging: {
          type: Boolean,
          default: false
        },
        meal_suggestions: {
          type: Boolean,
          default: true
        },
        nutrition_analysis: {
          type: Boolean,
          default: true
        },
        goal_recommendations: {
          type: Boolean,
          default: true
        }
      }
    },
    // Household sharing settings
    household: {
      // Unique household ID (shared between household members)
      household_id: {
        type: String,
        index: true,
        sparse: true
      },
      // User's display name for household features
      display_name: {
        type: String,
        trim: true
      },
      // Whether to share food logs with household
      share_food_logs: {
        type: Boolean,
        default: true
      },
      // Whether to share weight data with household
      share_weight: {
        type: Boolean,
        default: false
      },
      // Whether to share meals/templates with household
      share_meals: {
        type: Boolean,
        default: true
      }
    },
    // Favorite food items for quick logging
    favorite_foods: [{
      type: ObjectId,
      ref: 'FoodItem'
    }]
  };
}

/**
 * Schema options. `created_at` / `updated_at` rather than mongoose's default
 * camelCase, matching the documents already in the collection.
 */
const userSettingsOptions = {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
};

/* -------------------------------------------------------------------------
 * `garmin.password` encryption at rest  (DOCS/SUITE_TODO.md #20, step 2)
 * -------------------------------------------------------------------------
 * The Garmin Connect password is a *reusable* third-party credential: the two
 * backends log in to Garmin on the user's behalf, so it cannot be hashed — it
 * has to be recoverable. It is therefore encrypted with
 * `@geeksuite/crypto-vault` (AES-256-GCM, `KEY_VAULT_SECRET`,
 * `v1:{iv}:{tag}:{ciphertext}`) before it reaches MongoDB.
 *
 * WHY THE ENCRYPTION LIVES HERE AND NOT IN AN APP
 * -----------------------------------------------
 * This field has TWO writers and TWO readers, in two different processes:
 *
 *   write  fitnessgeek  routes/settingsRoutes.js  PUT /api/settings
 *   write  basegeek     graphql/fitnessgeek/resolvers.js  updateFitnessUserSettings
 *   read   fitnessgeek  services/garminConnectService.js  buildClient/getStatus
 *   read   basegeek     graphql/fitnessgeek/resolvers.js  buildGarminClient/garminStatus
 *
 * Both processes build their model from `createUserSettingsSchema()` below, so
 * this module is the ONLY choke point every one of those four sites passes
 * through. Encrypting in either app alone would leave the other app writing
 * plaintext and — far worse — reading ciphertext straight into a Garmin login.
 *
 * CONSEQUENCE FOR DEPLOYMENT: both apps must be configured with the SAME
 * `KEY_VAULT_SECRET`. That contradicts the "basegeek only / never share across
 * apps" row in the repo's `DEPLOY.md`; see `apps/fitnessgeek/DOCS/CONTEXT.md`
 * for the rollout order.
 *
 * HOW IT IS WIRED
 * ---------------
 *   - `pre('save')` and `pre(<update ops>)` encrypt on the way in. Both are
 *     idempotent: `isEncrypted()` short-circuits an already-packed value, so a
 *     re-save, a replayed update, or a second backfill run is a no-op.
 *   - A getter on the path decrypts on the way out. Mongoose does NOT apply
 *     getters in `toObject()` / `toJSON()` (verified — they return the packed
 *     ciphertext), so serialising a settings document still cannot leak the
 *     plaintext; only explicit property access (`settings.garmin.password`),
 *     which is exactly the Garmin login path, sees it.
 *   - Legacy plaintext rows keep working until the backfill runs: a value that
 *     is not `isEncrypted()` is passed through both ways untouched.
 *   - A corrupt or wrong-key value fails CLOSED — `safeDecrypt()` logs and
 *     returns null, so the Garmin login fails on bad credentials rather than
 *     the request throwing.
 *
 * `@geeksuite/crypto-vault` is required LAZILY: it throws at module load when
 * `KEY_VAULT_SECRET` is absent, and this schema module is imported by things
 * that never touch a Garmin password. Fail-fast at boot is the app's job (see
 * `apps/fitnessgeek/backend/src/config/keyVault.js`), not this module's.
 */

const GARMIN_PASSWORD_PATH = 'garmin.password';

let _vault = null;
let _vaultLoadError = null;

function getVault() {
  if (_vault || _vaultLoadError) return _vault;
  try {
    _vault = require('@geeksuite/crypto-vault');
  } catch (err) {
    // Message only. crypto-vault never puts the key material in its errors.
    _vaultLoadError = err;
    console.warn(
      '[schemas/userSettings] @geeksuite/crypto-vault unavailable — ' +
      'the Garmin password cannot be encrypted or decrypted: ' + err.message
    );
  }
  return _vault;
}

/**
 * Encrypt a Garmin password for storage. Idempotent.
 *
 * @param {*} value  the incoming value; anything that is not a non-empty
 *                   string is returned untouched (clears, unsets, nulls).
 * @returns {*} packed ciphertext, or the value unchanged.
 * @throws {Error} if the vault is unavailable — a write must never silently
 *                 fall back to storing plaintext.
 */
function encryptGarminPassword(value) {
  if (typeof value !== 'string' || value === '') return value;

  const vault = getVault();
  if (!vault) {
    throw new Error(
      'Refusing to store the Garmin password: KEY_VAULT_SECRET is not configured ' +
      '(see apps/fitnessgeek/DOCS/CONTEXT.md). Generate one with `openssl rand -hex 32`.'
    );
  }

  if (vault.isEncrypted(value)) return value; // already packed — no double-wrap
  return vault.encrypt(value);
}

/**
 * Resolve a stored Garmin password back to plaintext for the login path.
 * Never throws.
 *
 * @param {*} value  packed ciphertext, legacy plaintext, or nothing.
 * @returns {*} plaintext, the untouched legacy value, or null when a packed
 *              value cannot be decrypted (wrong key / tampered / no vault).
 */
function readGarminPassword(value) {
  if (typeof value !== 'string' || value === '') return value;

  const vault = getVault();
  if (!vault) return null;                       // fail closed, already warned
  if (!vault.isEncrypted(value)) return value;   // legacy plaintext, pre-backfill
  return vault.safeDecrypt(value);               // null + console.warn on failure
}

/**
 * Rewrite `garmin.password` inside one `$set`-shaped object, in both the
 * dot-path form (`{'garmin.password': x}`) and the nested form
 * (`{garmin: {password: x}}`). Both are used in production today.
 */
function encryptGarminPasswordIn(container) {
  if (!container || typeof container !== 'object') return;

  if (typeof container[GARMIN_PASSWORD_PATH] === 'string') {
    container[GARMIN_PASSWORD_PATH] = encryptGarminPassword(container[GARMIN_PASSWORD_PATH]);
  }
  if (container.garmin && typeof container.garmin === 'object' &&
      typeof container.garmin.password === 'string') {
    container.garmin.password = encryptGarminPassword(container.garmin.password);
  }
}

/**
 * Attach the encrypt-on-write hooks and the decrypt-on-read getter to a
 * freshly built schema. Called by `createUserSettingsSchema()`, so every
 * consumer gets it whether it knows about it or not.
 */
function attachGarminPasswordEncryption(schema) {
  // --- read: decrypt on property access -----------------------------------
  const passwordPath = schema.path(GARMIN_PASSWORD_PATH);
  if (passwordPath) passwordPath.get(readGarminPassword);

  // --- write: document saves ----------------------------------------------
  schema.pre('save', function encryptGarminPasswordOnSave(next) {
    try {
      if (this.isModified(GARMIN_PASSWORD_PATH)) {
        // getters: false — read the stored value, not the decrypted view, or
        // this re-encrypts a value the getter just unwrapped.
        const raw = this.get(GARMIN_PASSWORD_PATH, null, { getters: false });
        const packed = encryptGarminPassword(raw);
        if (packed !== raw) this.set(GARMIN_PASSWORD_PATH, packed);
      }
      next();
    } catch (err) {
      next(err);
    }
  });

  // --- write: query updates -----------------------------------------------
  // Both writers reach this document through findOneAndUpdate($set); the rest
  // are covered so a future caller cannot slip past the choke point.
  schema.pre(
    ['findOneAndUpdate', 'updateOne', 'updateMany', 'replaceOne'],
    function encryptGarminPasswordOnUpdate(next) {
      try {
        const update = this.getUpdate();
        // An aggregation-pipeline update is out of scope; nothing uses one here.
        if (update && !Array.isArray(update)) {
          encryptGarminPasswordIn(update);
          encryptGarminPasswordIn(update.$set);
          encryptGarminPasswordIn(update.$setOnInsert);
          this.setUpdate(update);
        }
        next();
      } catch (err) {
        next(err);
      }
    }
  );

  return schema;
}

/**
 * Build a fresh `UserSettings` schema, indexes included.
 *
 * Statics are deliberately NOT attached here — the two writers need different
 * ones (basegeek's gateway enforces caller ownership, fitnessgeek's backend has
 * already authenticated by the time it gets here). Statics do not affect
 * `schema.paths`, so they cannot cause the strict-mode data loss this module
 * exists to prevent.
 *
 * @param {import('mongoose')} mongoose - the caller's mongoose instance.
 * @returns {import('mongoose').Schema}
 */
function createUserSettingsSchema(mongoose) {
  const schema = new mongoose.Schema(userSettingsDefinition(mongoose), userSettingsOptions);

  // Ensure one settings document per user.
  schema.index({ user_id: 1 }, { unique: true });

  // Encrypt `garmin.password` at rest for every writer that builds from here.
  attachGarminPasswordEncryption(schema);

  return schema;
}

module.exports = {
  userSettingsDefinition,
  userSettingsOptions,
  createUserSettingsSchema,
  // Garmin password encryption — exported for the Garmin login path, the
  // backfill script (apps/fitnessgeek/backend/scripts/encryptGarminPasswords.js)
  // and their tests. Ordinary reads and writes go through the schema itself.
  encryptGarminPassword,
  readGarminPassword,
  attachGarminPasswordEncryption,
};
