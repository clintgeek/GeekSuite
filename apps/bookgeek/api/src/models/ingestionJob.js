import mongoose from "mongoose";

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

export const IngestionJob = mongoose.model("IngestionJob", ingestionJobSchema);
