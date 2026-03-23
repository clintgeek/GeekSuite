const mongoose = require('mongoose');

const LearningPathSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    instrumentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Instrument', required: true },
    level: { type: String, required: true },
    audience: { type: String, default: 'both' },
    trackType: { type: String, default: 'core' },
    isDefault: { type: Boolean, default: false },
    template: { type: String, default: 'linear_units_v1' },
    title: { type: String },
    subtitle: { type: String },
    content: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

module.exports = mongoose.model('LearningPath', LearningPathSchema);
