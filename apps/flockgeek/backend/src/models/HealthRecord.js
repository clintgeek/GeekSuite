import mongoose from "mongoose";

const HealthRecordSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true },
    birdId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bird",
      required: true,
      index: true
    },
    eventDate: { type: Date, required: true },
    type: {
      type: String,
      enum: ["illness", "injury", "treatment", "vaccination", "checkup", "cull"],
      required: true
    },

    // Details
    diagnosis: { type: String },
    treatment: { type: String },
    outcome: {
      type: String,
      enum: ["recovered", "ongoing", "deceased", "culled", "NA"]
    },
    cullReason: { type: String },
    vet: { type: String },
    costCents: { type: Number }, // Cost in cents

    // Notes
    notes: { type: String },

    // Soft delete
    deletedAt: { type: Date }
  },
  { timestamps: true }
);

// Indexes
HealthRecordSchema.index({ ownerId: 1, birdId: 1, eventDate: -1 });
HealthRecordSchema.index({ ownerId: 1, type: 1, eventDate: -1 });

export default mongoose.model("HealthRecord", HealthRecordSchema);
