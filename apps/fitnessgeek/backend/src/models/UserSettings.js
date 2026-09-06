import mongoose from 'mongoose';
import { createUserSettingsSchema } from '@geeksuite/schemas/fitnessgeek/userSettings';
import { flattenForSet } from '../utils/flattenSettingsUpdate.js';

// The field set lives in @geeksuite/schemas so that this model and basegeek's
// GraphQL copy (apps/basegeek/packages/api/src/graphql/fitnessgeek/models/
// UserSettings.js) cannot drift. They write the same collection, and mongoose
// strict mode silently drops paths one side doesn't know about — see the
// module header and apps/fitnessgeek/DOCS/USER_SETTINGS_SCHEMA.md.
//
// Do NOT add fields here. Add them to the shared module; the tripwire tests in
// both suites fail if this model stops matching it.
const userSettingsSchema = createUserSettingsSchema(mongoose);

// Static method to get or create user settings
userSettingsSchema.statics.getOrCreate = async function(userId) {
  let settings = await this.findOne({ user_id: userId });

  if (!settings) {
    settings = new this({ user_id: userId });
    await settings.save();
  }

  return settings;
};

// Static method to update user settings.
//
// PARTIAL, dot-path, one `$set` — the same three rules `PUT /api/settings` and
// basegeek's `updateFitnessUserSettings` follow (BURN_REVIEW #5, #6). This
// static was the one writer of this collection still `$set`-ing whole nested
// objects, which mongoose leaves undotted and MongoDB therefore treats as a
// REPLACEMENT of the sub-document: `updateSettings(id, { ai: { enabled: false } })`
// deleted `ai.features`, and a partial `nutrition_goal` deleted bmr, tdee,
// weekly_schedule and the keto block. Callers: `PUT /api/settings/ai`,
// `PUT /api/settings/dashboard`, `POST /api/goals`.
//
// An update whose flattened form is empty falls back to `$setOnInsert` — an
// empty `$set` is a MongoDB error, not a no-op.
userSettingsSchema.statics.updateSettings = async function(userId, updateData) {
  const $set = flattenForSet(updateData);

  const settings = await this.findOneAndUpdate(
    { user_id: userId },
    Object.keys($set).length ? { $set } : { $setOnInsert: { user_id: userId } },
    { upsert: true, new: true }
  );

  return settings;
};

export default mongoose.model('UserSettings', userSettingsSchema);
