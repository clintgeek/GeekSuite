const mongoose = require('mongoose');
const { createUserSettingsSchema } = require('@geeksuite/schemas/fitnessgeek/userSettings');

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

// Static method to update user settings
userSettingsSchema.statics.updateSettings = async function(userId, updateData) {
  const settings = await this.findOneAndUpdate(
    { user_id: userId },
    { $set: updateData },
    { upsert: true, new: true }
  );

  return settings;
};

module.exports = mongoose.model('UserSettings', userSettingsSchema);
