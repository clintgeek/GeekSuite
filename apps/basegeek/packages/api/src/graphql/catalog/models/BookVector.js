import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

/**
 * One embedding of a book's catalog text (`catalogText.js`), in the bookgeek
 * database beside the books themselves (MCP_SPEC D18). BookGeek's library is
 * household-shared — `Book` has no owner field — so neither do these. Only
 * basegeek's catalog indexer writes here.
 */
const schema = new mongoose.Schema({
  itemId: { type: mongoose.Schema.Types.ObjectId, required: true },
  model: { type: String, required: true },
  hash: { type: String, required: true },
  vector: { type: [Number], default: [] },
  indexedAt: { type: Date, default: Date.now },
});
schema.index({ itemId: 1, model: 1 }, { unique: true });

const conn = getAppConnection('bookgeek');
export const BookVector = conn.models.BookVector || conn.model('BookVector', schema, 'bookvectors');
