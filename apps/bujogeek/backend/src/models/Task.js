import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema({
  // Basic task information
  content: {
    type: String,
    required: true,
    trim: true
  },
  signifier: {
    type: String,
    enum: ['*', '@', 'x', '<', '>', '-', '!', '?', '#'],
    default: '*',
    description: {
      '*': 'Task to do',
      '@': 'Scheduled Event/Appointment',
      'x': 'Completed Task',
      '<': 'Migrated to Backlog',
      '>': 'Scheduled for Future',
      '-': 'Note/General Log',
      '!': 'Priority Task',
      '?': 'Question/Follow-up',
      '#': 'Tag'
    }
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'migrated_back', 'migrated_future'],
    default: 'pending'
  },

  // Task metadata
  dueDate: {
    type: Date,
    default: null
  },
  priority: {
    type: Number,
    min: 1,
    max: 3,
    default: null
  },
  note: {
    type: String,
    trim: true,
    default: null
  },
  tags: [{
    type: String,
    trim: true
  }],

  // Migration tracking
  originalDate: {
    type: Date,
    default: Date.now,
    required: true
  },
  migratedFrom: {
    type: Date,
    default: null
  },
  migratedTo: {
    type: Date,
    default: null
  },
  isBacklog: {
    type: Boolean,
    default: false
  },

  // Task relationships
  parentTask: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    default: null
  },
  subtasks: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task'
  }],

  // System fields
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
});

// Update the updatedAt field before saving
taskSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Virtual for task type based on signifier
taskSchema.virtual('taskType').get(function() {
  const signifierMap = {
    '*': 'task',
    '@': 'event',
    'x': 'completed',
    '<': 'backlog',
    '>': 'future',
    '-': 'note',
    '!': 'priority',
    '?': 'question',
    '#': 'tagged'
  };
  return signifierMap[this.signifier] || 'task';
});

// Method to schedule task for a specific date
taskSchema.methods.migrateToFuture = function(date) {
  this.status = 'migrated_future';
  this.signifier = '>';
  this.migratedFrom = new Date();
  this.migratedTo = date;
  this.dueDate = date;
  return this.save();
};

// Method to carry forward task
taskSchema.methods.carryForward = function() {
  const newTask = new Task({
    content: this.content,
    signifier: this.signifier,
    priority: this.priority,
    tags: this.tags,
    originalDate: this.originalDate,
    migratedFrom: new Date(),
    createdBy: this.createdBy
  });
  return newTask.save();
};

const Task = mongoose.model('Task', taskSchema);

export default Task;