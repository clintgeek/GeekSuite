import mongoose from 'mongoose';

const taskOrderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  dateKey: {
    type: String, // 'yyyy-MM-dd'
    required: true,
    index: true
  },
  orderedTaskIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task'
  }],
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

taskOrderSchema.index({ userId: 1, dateKey: 1 }, { unique: true });

taskOrderSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const TaskOrder = mongoose.model('TaskOrder', taskOrderSchema);

export default TaskOrder;


