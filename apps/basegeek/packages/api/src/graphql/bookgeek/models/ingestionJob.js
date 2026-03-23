import mongoose from "mongoose";
import { getAppConnection } from '../../shared/appConnections.js';

const bookConn = getAppConnection('bookgeek');

const ingestionJobSchema = new mongoose.Schema(
  {
    originalFilename: { type: String },
    status: { type: String, default: "pending" },
    calibreOutput: { type: mongoose.Schema.Types.Mixed },
    error: { type: String },
    completedAt: { type: Date },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const IngestionJob = bookConn.model("IngestionJob", ingestionJobSchema);
