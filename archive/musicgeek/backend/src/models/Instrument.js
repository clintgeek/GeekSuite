const mongoose = require('mongoose');

const TuningSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
    description: String,
    strings: [
      {
        note: String,
        octave: Number,
        frequency: Number,
        string: Number,
      },
    ],
  },
  { _id: true }
);

const InstrumentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true }, // e.g., 'guitar'
    displayName: { type: String, required: true },
    description: String,
    icon: String,
    colorTheme: String,

    features: {
      tunerEnabled: { type: Boolean, default: false },
      hasFretboard: { type: Boolean, default: false },
    },

    tunings: [TuningSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Instrument', InstrumentSchema);
