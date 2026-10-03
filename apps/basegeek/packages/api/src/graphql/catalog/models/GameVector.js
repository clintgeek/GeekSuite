import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

/**
 * One embedding of a household game's catalog text (`catalogText.js`), in the
 * gamegeek database beside the games themselves (MCP_SPEC D18). The vectors
 * are household-shared like the catalog; `householdId` is carried so search
 * never crosses a tenant. Only basegeek's catalog indexer writes here.
 */
const schema = new mongoose.Schema({
  itemId: { type: mongoose.Schema.Types.ObjectId, required: true },
  householdId: { type: String, required: true },
  model: { type: String, required: true },
  hash: { type: String, required: true },
  vector: { type: [Number], default: [] },
  indexedAt: { type: Date, default: Date.now },
});
schema.index({ itemId: 1, model: 1 }, { unique: true });
schema.index({ householdId: 1, model: 1 });

const conn = getAppConnection('gamegeek');
export const GameVector = conn.models.GameVector || conn.model('GameVector', schema, 'gamevectors');
