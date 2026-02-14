const mongoose = require('mongoose');

const bloodPressureSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true
  },
  systolic: {
    type: Number,
    required: true,
    min: 70,
    max: 200
  },
  diastolic: {
    type: Number,
    required: true,
    min: 40,
    max: 130
  },
  pulse: {
    type: Number,
    min: 40,
    max: 200,
    default: null
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
bloodPressureSchema.index({ userId: 1, log_date: -1 });

// Virtual for formatted date
bloodPressureSchema.virtual('formatted_date').get(function() {
  return this.log_date.toISOString().split('T')[0];
});

// Virtual for BP status
bloodPressureSchema.virtual('status').get(function() {
  const sys = this.systolic;
  const dia = this.diastolic;

  if (sys < 120 && dia < 80) return 'Normal';
  if (sys < 130 && dia < 80) return 'Elevated';
  if (sys < 140 && dia < 90) return 'High Normal';
  if (sys < 160 && dia < 100) return 'Stage 1';
  if (sys < 180 && dia < 110) return 'Stage 2';
  return 'Crisis';
});

// Ensure virtuals are serialized
bloodPressureSchema.set('toJSON', { virtuals: true });
bloodPressureSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('BloodPressure', bloodPressureSchema);