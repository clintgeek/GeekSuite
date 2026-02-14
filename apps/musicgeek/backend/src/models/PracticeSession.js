const mongoose = require('mongoose');

const PracticeSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    durationMinutes: { type: Number, required: true },
    notes: String,
    lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' }, // Optional link
  },
  { timestamps: true }
);

module.exports = mongoose.model('PracticeSession', PracticeSessionSchema);
