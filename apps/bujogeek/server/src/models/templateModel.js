import mongoose from 'mongoose';

const templateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['daily', 'weekly', 'monthly', 'meeting', 'custom'],
    default: 'custom'
  },
  tags: [{
    type: String,
    trim: true
  }],
  isPublic: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastUsed: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for better query performance
templateSchema.index({ createdBy: 1, type: 1 });
templateSchema.index({ isPublic: 1, type: 1 });
templateSchema.index({ tags: 1 });

const Template = mongoose.model('Template', templateSchema);

export default Template;