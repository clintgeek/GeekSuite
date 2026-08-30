import mongoose from "mongoose";

const itemSchema = new mongoose.Schema(
  {
    bookId: { type: String, required: true },
    format: { type: String, required: true },
  },
  { _id: false }
);

const deviceBasketSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  userId: { type: String, required: true },
  device: { type: String, required: true, default: "kindle" },
  items: [itemSchema],
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
});

// TTL index is a cleanup mechanism only — Mongo's monitor runs ~every 60s.
// Every request handler MUST check expiresAt explicitly and reject expired baskets.
deviceBasketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const DeviceBasket = mongoose.model("DeviceBasket", deviceBasketSchema);
