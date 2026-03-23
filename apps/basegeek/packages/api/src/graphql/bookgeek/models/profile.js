import mongoose from "mongoose";
import { getAppConnection } from '../../shared/appConnections.js';

const bookConn = getAppConnection('bookgeek');

const profileSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },
    kindleEmail: { type: String },
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

export const Profile = bookConn.model("Profile", profileSchema);
