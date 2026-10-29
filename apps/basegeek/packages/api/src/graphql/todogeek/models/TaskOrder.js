import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

const todoConn = getAppConnection('todogeek');

const taskOrderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dateKey: { type: String, required: true, index: true },
  // STRINGS, not ObjectIds (2026-10-29): a rendered day holds virtual
  // occurrences of repeating tasks, `virtual_<masterId>_<epochMs>`, and an
  // ObjectId array cannot hold them — a dragged repeating task snapped back.
  // Rows written before this change still hold ObjectIds; they read back as
  // ObjectIds through `.lean()` and every reader goes through `String(id)`,
  // so the old and new shapes read the same. The accepted id shapes are
  // checked in validation.js (`orderTaskIdString`).
  orderedTaskIds: [{ type: String }],
  updatedAt: { type: Date, default: Date.now },
});

taskOrderSchema.index({ userId: 1, dateKey: 1 }, { unique: true });
taskOrderSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

const TaskOrder = todoConn.models.TaskOrder || todoConn.model('TaskOrder', taskOrderSchema);
export default TaskOrder;
