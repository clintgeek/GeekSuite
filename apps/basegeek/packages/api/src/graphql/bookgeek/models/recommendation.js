import mongoose from "mongoose";
import { getAppConnection } from '../../shared/appConnections.js';

const bookConn = getAppConnection('bookgeek');

const recommendationItemSchema = new mongoose.Schema(
  {
    title: { type: String },
    authors: [{ type: String }],
    reason: { type: String },
    status: { type: String },
    matchedBookId: { type: mongoose.Schema.Types.ObjectId, ref: "Book" },
  },
  { _id: false }
);

const recommendationSchema = new mongoose.Schema(
  {
    seedBooks: [{ type: mongoose.Schema.Types.ObjectId, ref: "Book" }],
    recommendations: [recommendationItemSchema],
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const Recommendation = bookConn.model("Recommendation", recommendationSchema);
