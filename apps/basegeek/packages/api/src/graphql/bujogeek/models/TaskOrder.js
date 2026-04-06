import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

const bujoConn = getAppConnection('bujogeek');

const taskOrderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dateKey: { type: String, required: true, index: true },
  orderedTaskIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
  updatedAt: { type: Date, default: Date.now },
});

taskOrderSchema.index({ userId: 1, dateKey: 1 }, { unique: true });
taskOrderSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

const TaskOrder = bujoConn.models.TaskOrder || bujoConn.model('TaskOrder', taskOrderSchema);
export default TaskOrder;
