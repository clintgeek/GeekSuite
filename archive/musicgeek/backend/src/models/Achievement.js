const mongoose = require('mongoose');

const AchievementSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    description: String,
    criteria: String,
    xpReward: { type: Number, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Achievement', AchievementSchema);
