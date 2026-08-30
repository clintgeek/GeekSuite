import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

const bujoConn = getAppConnection('bujogeek');

/**
 * A BuJo *collection* — a named list of entries that lives OUTSIDE the daily
 * log ("Books to Read", "Project X", "Gift Ideas"). Its entries are ordinary
 * Tasks carrying a `collectionId`; an entry only enters the daily log once it
 * is given a dueDate (see taskService.getTasksForDateRange).
 */
const collectionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: null },
    archived: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

// Listing query: a user's collections, unarchived first, alphabetical.
collectionSchema.index({ createdBy: 1, archived: 1, name: 1 });

const Collection = bujoConn.models.Collection || bujoConn.model('Collection', collectionSchema);
export default Collection;
