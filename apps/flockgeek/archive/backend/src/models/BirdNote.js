import mongoose from "mongoose";

const BirdNoteSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true },
    birdId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bird",
      required: true,
      index: true,
    },
    note: { type: String, required: true },
    loggedAt: { type: Date, required: true },
    deletedAt: { type: Date },
  },
  { timestamps: true }
);

BirdNoteSchema.index({ birdId: 1, loggedAt: -1 });
BirdNoteSchema.index({ ownerId: 1, birdId: 1 });

// Check if model already exists to avoid OverwriteModelError
export default mongoose.models.BirdNote || mongoose.model("BirdNote", BirdNoteSchema);