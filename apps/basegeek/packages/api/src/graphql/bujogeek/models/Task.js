import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

const bujoConn = getAppConnection('bujogeek');

const taskSchema = new mongoose.Schema({
  content: { type: String, required: true, trim: true },
  signifier: {
    type: String,
    enum: ['*', '@', 'x', '<', '>', '-', '!', '?', '#'],
    default: '*',
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'migrated_back', 'migrated_future', 'cancelled', 'blocked'],
    default: 'pending',
  },
  dueDate: { type: Date, default: null },
  priority: { type: Number, min: 1, max: 3, default: null },
  note: { type: String, trim: true, default: null },
  tags: [{ type: String, trim: true }],
  originalDate: { type: Date, default: Date.now, required: true },
  originalDueDate: { type: Date, default: null },
  migratedFrom: { type: Date, default: null },
  migratedTo: { type: Date, default: null },
  isBacklog: { type: Boolean, default: false },
  recurrencePattern: {
    type: String,
    enum: ['none', 'daily', 'weekly', 'monthly'],
    default: 'none',
  },
  recurrenceRule: { type: String, default: null },
  exdates: [{ type: Date }],
  seriesId: { type: String, default: null },
  isSeriesMaster: { type: Boolean, default: false },
  // Filed into a collection (a named list outside the daily log). An entry
  // with a collectionId and no dueDate is deliberately kept out of the
  // daily/weekly/monthly log queries — see taskService.getTasksForDateRange.
  collectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Collection', default: null },
  parentTask: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
  subtasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
  completedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  // "Parked": the task is waiting on something outside itself. A blocked task
  // KEEPS its dueDate — it is simply not part of the log while blocked: every
  // dated view (daily/weekly/monthly) filters it out, so it is neither "due
  // today" nor "overdue". blockedAt is the mirror of completedAt/cancelledAt
  // and is cleared the moment the task leaves the blocked state.
  // See taskService.blockTask / unblockTask.
  blockedReason: { type: String, trim: true, maxlength: 280, default: null },
  blockedAt: { type: Date, default: null },
  // When the web-push reminder for this task's dueDate was delivered. Non-null
  // means "already reminded" and is what keeps the 60s scheduler from firing
  // the same task twice; taskService.updateTask clears it whenever dueDate
  // moves, so a rescheduled task becomes eligible again. See reminderService.
  remindedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
});

taskSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

taskSchema.virtual('taskType').get(function () {
  const signifierMap = {
    '*': 'task', '@': 'event', 'x': 'completed', '<': 'backlog',
    '>': 'future', '-': 'note', '!': 'priority', '?': 'question', '#': 'tagged',
  };
  return signifierMap[this.signifier] || 'task';
});

taskSchema.index({ createdBy: 1, tags: 1 });
// The reminder scheduler's sweep: pending, not-yet-reminded, due in the window.
taskSchema.index({ status: 1, remindedAt: 1, dueDate: 1 });
taskSchema.index({ createdBy: 1, collectionId: 1 });
// The blocked list: owner's parked tasks, newest-blocked first.
taskSchema.index({ createdBy: 1, status: 1, blockedAt: -1 });

// ONE MATERIALISED OVERRIDE PER OCCURRENCE.
//
// Completing a `virtual_` occurrence writes an override row. The checkbox had
// no busy state and a virtual's id does not change until the first response
// merges, so a double tap sent the same synthetic id twice and
// `updateStatusInternal` did an unconditional `new Task(...).save()` — two
// permanent rows for one occurrence, with nothing to stop it. `HabitLog`
// already guards its equivalent this way.
//
// PARTIAL, AND THE FILTER IS `$type`, NOT `$exists`. Both fields declare
// `default: null`, so every ordinary task carries an explicit
// `seriesId: null` — `$exists: true` matches all of them, and a plain unique
// index would see one `(null, null)` pair per non-recurring task and refuse
// to build. Checked against the live collection: 363 tasks, 363 of them with
// a null seriesId. `$type` is what excludes those.
taskSchema.index(
  { seriesId: 1, originalDueDate: 1 },
  {
    unique: true,
    partialFilterExpression: {
      seriesId: { $type: 'string' },
      originalDueDate: { $type: 'date' },
    },
  }
);

const Task = bujoConn.models.Task || bujoConn.model('Task', taskSchema);
export default Task;
