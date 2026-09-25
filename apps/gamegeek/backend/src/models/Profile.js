/**
 * GameProfile — per-user settings (custom shelves, saved filters, Steam id,
 * hardware owned). Collection `gameprofiles` (mongoose's default pluralized
 * form of the `GameProfile` model name).
 */
import mongoose from 'mongoose';
import profileSchemaModule from '@geeksuite/schemas/gamegeek/profile';

const { createGameProfileSchema } = profileSchemaModule;

const schema = createGameProfileSchema(mongoose);

export default mongoose.models.GameProfile || mongoose.model('GameProfile', schema);
