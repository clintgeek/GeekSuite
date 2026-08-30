import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

const bujoConn = getAppConnection('bujogeek');

/**
 * One document = "this habit was done on this day". There is no `done: false`
 * row: absence is the negative. `date` is always UTC midnight, the module's
 * calendar-date convention (see habitService.toUtcMidnight), so a day is an
 * exact-equality lookup rather than a range scan.
 *
 * The (habitId, date) unique index is the integrity guarantee behind the
 * toggle: two concurrent "mark done" calls cannot leave two rows for one day —
 * the loser gets a duplicate-key error, which habitService swallows and reports
 * as the day simply being done.
 */
const habitLogSchema = new mongoose.Schema(
  {
    habitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Habit', required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: Date, required: true },
  },
  { timestamps: true }
);

// One log per habit per day — the toggle's idempotency backstop.
habitLogSchema.index({ habitId: 1, date: 1 }, { unique: true });

// The grid read: every log a user has in a date window.
habitLogSchema.index({ createdBy: 1, date: 1 });

const HabitLog = bujoConn.models.HabitLog || bujoConn.model('HabitLog', habitLogSchema);
export default HabitLog;
