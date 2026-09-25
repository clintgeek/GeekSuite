/**
 * GamePlayer — one user's relationship with one household game. See Game.js
 * for why this is built from the shared @geeksuite/schemas factory.
 */
import mongoose from 'mongoose';
import gamePlayerSchemaModule from '@geeksuite/schemas/gamegeek/gamePlayer';

const { createGamePlayerSchema } = gamePlayerSchemaModule;

const schema = createGamePlayerSchema(mongoose);

export default mongoose.models.GamePlayer || mongoose.model('GamePlayer', schema);
