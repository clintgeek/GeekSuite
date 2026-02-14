const mongoose = require('mongoose');

const userProjectSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  projectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  status: {
    type: String,
    enum: ['assigned', 'in-progress', 'completed'],
    default: 'assigned'
  },
  photos: [{
    url: String,
    uploadDate: {
      type: Date,
      default: Date.now
    },
    exifData: {
      camera: String,
      lens: String,
      mode: String,
      aperture: String,
      shutterSpeed: String,
      iso: Number,
      focalLength: String,
      meteringMode: String,
      flash: String,
      whiteBalance: String,
      dateTaken: Date,
      gps: {
        latitude: Number,
        longitude: Number
      }
    },
    aiAnalysis: {
      compositionScore: Number,
      exposureScore: Number,
      techniqueScore: Number,
      feedback: String,
      suggestions: [String],
      analyzedAt: Date
    }
  }],
  chatHistory: [{
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true
    },
    content: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  startedAt: Date,
  completedAt: Date,
  feedback: String,
  rating: {
    type: Number,
    min: 1,
    max: 5
  },
  xpEarned: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index for user-project queries
userProjectSchema.index({ userId: 1, projectId: 1 });
userProjectSchema.index({ userId: 1, status: 1 });

userProjectSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('UserProject', userProjectSchema);
