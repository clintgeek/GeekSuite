import mongoose from "mongoose";

const LanguageSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      maxLength: 5
    },
    name: { type: String, required: true },
    nativeName: { type: String },
    flag: { type: String }, // emoji or icon reference
    isActive: { type: Boolean, default: true },
    availableLevels: [{ type: String, enum: ["A1", "A2", "B1", "B2", "C1", "C2"] }],
    orderIndex: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export default mongoose.model("Language", LanguageSchema);
