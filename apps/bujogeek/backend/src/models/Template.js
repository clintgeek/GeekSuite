import mongoose from 'mongoose';

const templateSchema = new mongoose.Schema({
  // Basic template information
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  type: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'meeting', 'custom'],
    default: 'custom'
  },
  content: {
    type: String,
    required: true
  },

  // Template configuration
  isDefault: {
    type: Boolean,
    default: false
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  tags: [{
    type: String,
    trim: true
  }],

  // Template metadata
  variables: [{
    name: String,
    type: {
      type: String,
      enum: ['text', 'date', 'number', 'list'],
      default: 'text'
    },
    defaultValue: String,
    required: Boolean
  }],

  // System fields
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
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
});

// Update the updatedAt field before saving
templateSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Virtual for template preview (first 100 characters)
templateSchema.virtual('preview').get(function() {
  return this.content.substring(0, 100) + (this.content.length > 100 ? '...' : '');
});

// Use mongoose.models.Template if it exists, otherwise create a new model
const Template = mongoose.models.Template || mongoose.model('Template', templateSchema);

export default Template;