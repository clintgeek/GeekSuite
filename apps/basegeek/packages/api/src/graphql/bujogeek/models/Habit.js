import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

const bujoConn = getAppConnection('bujogeek');

/**
 * A *habit* — a thing the user intends to do on a repeating schedule, tracked
 * by presence rather than by task state. A habit is NOT a task: it never enters
 * the daily log, is never completed once, and carries no due date. Its whole
 * history is a set of HabitLog documents, one per day it was done.
 *
 * `daysOfWeek` holds JS day numbers (0 = Sunday … 6 = Saturday). An empty array
 * means "every day" — the common case, stored as absence rather than as all
 * seven numbers so that a habit's schedule reads as a deliberate narrowing.
 */
const habitSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    daysOfWeek: {
      type: [Number],
      default: [],
      validate: {
        validator: (days) => days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6),
        message: 'daysOfWeek must contain integers 0-6 (0 = Sunday)',
      },
    },
    color: { type: String, default: null },
    archived: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

// Listing query: a user's habits, unarchived first, alphabetical.
habitSchema.index({ createdBy: 1, archived: 1, name: 1 });

const Habit = bujoConn.models.Habit || bujoConn.model('Habit', habitSchema);
export default Habit;
