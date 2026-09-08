import mongoose from 'mongoose';
import { getAIGeekConnection } from '../config/database.js';
import { normalizeAppId } from '../services/callerIdentity.js';

// The roster is the enum. This was the sixth hand-typed copy of the same nine
// ids (Phase 2, 2026-09-07); `AISpend` had already set the precedent.
import { PROVIDER_IDS as PROVIDERS } from '../config/aiProviders.js';

const aiAppConfigSchema = new mongoose.Schema({
  appName: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  displayName: {
    type: String,
    default: ''
  },
  /**
   * Where this app's calls go. Two live values, two legacy ones.
   *
   *   `auto`     — health-ranked free rows, then the governed paid fallback
   *                if `allowPaid` is on and the budget agrees. The default,
   *                and what almost everything should be.
   *   `specific` — pinned provider + model, from the fields below.
   *
   *   `free` / `rotation` — Phase 2 legacy. `free` meant "free rows only" and
   *   `rotation` meant "every provider on its own default model"; `auto` is
   *   now both, so both are *read* as `auto` (with a hint in the log line —
   *   see `aiRoute.resolveRoute`) and rewritten to `auto` the next time the
   *   row is saved. They stay in the enum so an existing row can be re-saved
   *   without a validation error, and so the Phase 2 revert needs no data
   *   migration in either direction.
   */
  tier: {
    type: String,
    enum: ['auto', 'free', 'rotation', 'specific'],
    default: 'auto'
  },
  /**
   * Keep one model per conversation once the walk has found one that works.
   *
   * `'per-conversation'` makes the first successful `auto` pick for a
   * conversation id stick (see `models/AIStickyPick.js`) until it fails, at
   * which point the walk re-picks and flags the change. `null` — the default
   * — re-ranks on every call, which is what you want everywhere the answer
   * is a one-shot: a food parse does not care which model parsed yesterday's.
   *
   * StoryGeek's row gets this; a GM that changes voice mid-story is the whole
   * reason the feature exists.
   */
  sticky: {
    type: String,
    enum: ['per-conversation', null],
    default: null
  },
  /**
   * May this app's calls reach the governed paid fallback when every free row
   * is exhausted or cooling?
   *
   * Default **false**, and it should stay false for anything with a decent
   * deterministic fallback — a brief, a draft, a quick-add and a suggestion
   * all have one, so a short delay is cheaper than a cent. Turn it on only
   * where a fallback is materially worse than waiting (D8: StoryGeek GM
   * turns, to start).
   *
   * This is the *permission*, not the budget. The budget is
   * `AI_PAID_PER_DAY_USD` / `AI_PAID_PER_CALL_USD` and, above both, the
   * credit limit on the OpenRouter key itself.
   */
  allowPaid: {
    type: Boolean,
    default: false
  },
  // Only used when tier = "specific"
  provider: {
    type: String,
    enum: [...PROVIDERS, null],
    default: null
  },
  model: {
    type: String,
    default: null
  },
  // Ordered list of fallback providers when primary fails
  fallbackOrder: {
    type: [String],
    default: []
  },
  /**
   * How many `POST /api/ai/feature` calls this app may make per bucket per UTC
   * day, overriding the door's default of 200.
   *
   * A bound on a runaway loop, not a ration: the real ceilings are the free
   * tier's own rate limits and, for money, `AI_PAID_PER_DAY_USD`. `null` means
   * the default. Set it low for an app whose feature is a nice-to-have, or
   * high for one whose sessions are long (a StoryGeek evening is dozens of GM
   * turns).
   */
  dailyCap: {
    type: Number,
    default: null
  },
  // Default generation parameters (app can still override per-request)
  maxTokens: {
    type: Number,
    default: null
  },
  temperature: {
    type: Number,
    default: null
  },
  // Admin notes
  notes: {
    type: String,
    default: ''
  },
  // Auto-discovered vs manually created
  autoDiscovered: {
    type: Boolean,
    default: false
  },
  enabled: {
    type: Boolean,
    default: true
  },
  lastSeen: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

/**
 * The one spelling of an app id.
 *
 * Rows were created from whatever string a caller put in its request body, so
 * the collection holds `fitnessGeek`, `fitnessgeek` and `fitnessGeek:mealPlan`
 * for what is one app with one feature. Routing now resolves the caller's app
 * from its credential and normalizes it through here before the lookup; the
 * lookup itself still matches the legacy spellings case-insensitively (see
 * aiService.findAppConfig), so no stored row is orphaned.
 *
 * Schema fields are deliberately untouched — the AIGeek UI reads them by name.
 *
 * @param {*} value
 * @returns {string|null}
 */
aiAppConfigSchema.statics.normalizeAppName = function normalizeAppName(value) {
  return normalizeAppId(value);
};

const aiGeekConnection = getAIGeekConnection();
const AIAppConfig = aiGeekConnection.model('AIAppConfig', aiAppConfigSchema);

export default AIAppConfig;
