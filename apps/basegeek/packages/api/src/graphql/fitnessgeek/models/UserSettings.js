import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';
import { requireUser } from '../ownership.js';

// The field set lives in @geeksuite/schemas so that this model and
// fitnessgeek's REST copy (apps/fitnessgeek/backend/src/models/UserSettings.js)
// cannot drift. They write the same collection, and mongoose strict mode
// silently drops paths one side doesn't know about — that is how keto config
// vanished in April 2026. See the shared module's header and
// apps/fitnessgeek/DOCS/USER_SETTINGS_SCHEMA.md.
//
// Do NOT add fields here. Add them to the shared module (and to typeDefs.js if
// they should cross GraphQL); the tripwire tests in both suites fail if this
// model stops matching the shared definition.
//
// Default import + destructure: the shared module is CommonJS (fitnessgeek's
// backend is CJS and requires it directly), and this is the interop form that
// works identically under Node ESM and jest's --experimental-vm-modules.
import userSettingsSchemaModule from '@geeksuite/schemas/fitnessgeek/userSettings';

const { createUserSettingsSchema } = userSettingsSchemaModule;

const fitnessConn = getAppConnection('fitnessgeek');

const userSettingsSchema = createUserSettingsSchema(mongoose);

// Static method to get or create user settings
userSettingsSchema.statics.getOrCreate = async function(userId) {
  requireUser(userId);
  let settings = await this.findOne({ user_id: userId });

  if (!settings) {
    settings = new this({ user_id: userId });
    await settings.save();
  }

  return settings;
};

// Static method to update user settings
userSettingsSchema.statics.updateSettings = async function(userId, updateData) {
  requireUser(userId);
  // An empty $set is a MongoDB error, so fall back to a plain upsert.
  const update = Object.keys(updateData || {}).length
    ? { $set: updateData }
    : { $setOnInsert: { user_id: userId } };
  const settings = await this.findOneAndUpdate(
    { user_id: userId },
    update,
    { upsert: true, new: true }
  );

  return settings;
};

export default fitnessConn.model('UserSettings', userSettingsSchema);
