import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

const fitnessConn = getAppConnection('fitnessgeek');

const weightSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  weight_value: {
    type: Number,
    required: true,
    min: 0,
    max: 1000
  },
  log_date: {
    type: Date,
    required: true,
    default: Date.now
  },
  notes: {
    type: String,
    maxlength: 500,
    default: ''
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Compound index for efficient queries
weightSchema.index({ userId: 1, log_date: -1 });

// Virtual for formatted date
weightSchema.virtual('formatted_date').get(function() {
  return this.log_date.toISOString().split('T')[0];
});

// Ensure virtuals are serialized
weightSchema.set('toJSON', { virtuals: true });
weightSchema.set('toObject', { virtuals: true });

export default fitnessConn.model('Weight', weightSchema);