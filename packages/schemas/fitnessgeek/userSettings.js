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
 * and keeps this package dependency-free.
 *
 * This module is CommonJS on purpose: fitnessgeek's backend is CJS and
 * `require`s it directly, while basegeek's api is ESM and picks up the default
 * export through Node's ESM→CJS interop. Same arrangement as `@geeksuite/user`.
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
        natural_language_food_logging: {
          type: Boolean,
          default: true
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

  return schema;
}

module.exports = {
  userSettingsDefinition,
  userSettingsOptions,
  createUserSettingsSchema,
};
