const mongoose = require('mongoose');

const MED_TIME_OF_DAY = ['morning', 'afternoon', 'evening', 'bedtime'];

const medicationLogSchema = new mongoose.Schema({
  user_id: {
    type: String,
    required: true,
    index: true
  },
  log_date: {
    type: Date,
    required: true,
    index: true
  },
  time_of_day: {
    type: String,
    enum: MED_TIME_OF_DAY,
    required: true,
    index: true
  },
  medication_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medication',
    required: true,
    index: true
  },
  dose_value: {
    type: Number,
    default: null
  },
  dose_unit: {
    type: String,
    default: null
  },
  taken: {
    type: Boolean,
    default: true
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 300,
    default: ''
  }
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updatedAt'
  },
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

medicationLogSchema.index({ user_id: 1, log_date: 1, time_of_day: 1 });
medicationLogSchema.index({ user_id: 1, medication_id: 1 });

module.exports = mongoose.model('MedicationLog', medicationLogSchema);


