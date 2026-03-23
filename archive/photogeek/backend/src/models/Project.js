const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  slug: {
    type: String,
    required: true,
    unique: true
  },
  description: {
    type: String,
    required: true
  },
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    required: true
  },
  order: {
    type: Number,
    default: 0
  },
  technique: {
    name: String,
    category: String,
    difficulty: String
  },
  subject: String,
  location: String,
  lighting: String,
  cameraSettings: {
    mode: String,
    aperture: String,
    shutterSpeed: String,
    iso: String,
    focalLength: String,
    meteringMode: String
  },
  learningObjectives: [String],
  tips: [String],
  estimatedTime: String,
  xpReward: {
    type: Number,
    default: 100
  },
  tags: [String],
  imageUrl: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

projectSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Project', projectSchema);
