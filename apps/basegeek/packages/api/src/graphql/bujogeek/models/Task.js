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
    enum: ['pending', 'completed', 'migrated_back', 'migrated_future'],
    default: 'pending',
  },
  dueDate: { type: Date, default: null },
  priority: { type: Number, min: 1, max: 3, default: null },
  note: { type: String, trim: true, default: null },
  tags: [{ type: String, trim: true }],
  originalDate: { type: Date, default: Date.now, required: true },
  migratedFrom: { type: Date, default: null },
  migratedTo: { type: Date, default: null },
  isBacklog: { type: Boolean, default: false },
  recurrencePattern: {
    type: String,
    enum: ['none', 'daily', 'weekly', 'monthly'],
    default: 'none',
  },
  parentTask: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
  subtasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
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

const Task = bujoConn.models.Task || bujoConn.model('Task', taskSchema);
export default Task;
