import mongoose from "mongoose";
import { getAppConnection } from '../../shared/appConnections.js';

const bookConn = getAppConnection('bookgeek');

/**
 * The bookgeek Profile — per-user data in an otherwise shared library.
 *
 * This must stay field-for-field identical to `apps/bookgeek/api/src/models/profile.js`:
 * both models are built against the same `profiles` collection, and Mongoose
 * strict mode silently DROPS unknown fields on `$set`/`$push` rather than
 * erroring. That is exactly how fitnessgeek's keto config vanished in April
 * 2026 (see `DOCS/CONTEXT.md`). Add a field here and there, in the same commit.
 */
const profileSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },
    kindleEmail: { type: String },
    // Personal "secret word" typed on a device keyboard at /download-basket to
    // resolve the user's newest active basket. Deliberately low-security.
    deviceWord: { type: String, lowercase: true, trim: true },
    // User-defined shelves. `id` is "custom-<slug>" and is what gets written
    // to Book.shelf; `label` is what the UI shows.
    customShelves: [
      {
        id: { type: String, required: true },
        label: { type: String, required: true },
      },
    ],
    savedFilters: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true },
        sortBy: { type: String },
        sortDir: { type: String },
        searchQuery: { type: String },
        authorFilter: { type: String },
        tagFilter: { type: String },
        shelfFilter: { type: String },
        ownedOnly: { type: Boolean },
        ownedFilter: { type: String },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Sparse so profiles without a deviceWord don't collide on the missing value.
profileSchema.index({ deviceWord: 1 }, { unique: true, sparse: true });

export const Profile = bookConn.model("Profile", profileSchema);
