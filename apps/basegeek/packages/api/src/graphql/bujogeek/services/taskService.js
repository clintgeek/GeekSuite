import Task from '../models/Task.js';
import TaskOrder from '../models/TaskOrder.js';
import mongoose from 'mongoose';

class TaskService {
  constructor() {
    this.taskModel = Task;
  }

  toUtcMidnight(dateStr) {
    if (!dateStr) return new Date(new Date().setUTCHours(0, 0, 0, 0));
    let y, m, d;
    if (dateStr instanceof Date) {
      y = dateStr.getFullYear(); m = dateStr.getMonth(); d = dateStr.getDate();
    } else {
      const str = typeof dateStr === 'string' ? dateStr : new Date(dateStr).toISOString();
      const parts = str.split('T')[0].split('-').map(Number);
      y = parts[0]; m = parts[1] - 1; d = parts[2];
    }
    return new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  }

  formatDateKey(date) {
    const d = new Date(date);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${ y }-${ m }-${ day }`;
  }

  async getTasksForDateRange({ userId, startDate, endDate, viewType }) {
    const query = { createdBy: userId };
    if (viewType !== 'all') {
      query.isBacklog = { $ne: true };
    }
    const startOfDayDate = this.toUtcMidnight(startDate);
    const endOfDayDate = new Date(startOfDayDate);
    endOfDayDate.setUTCHours(23, 59, 59, 999);

    switch (viewType) {
      case 'daily':
        query.$or = [
          { dueDate: { $gte: startOfDayDate, $lte: endOfDayDate } },
          { status: 'completed', updatedAt: { $gte: startOfDayDate, $lte: endOfDayDate }, $or: [{ dueDate: { $gte: startOfDayDate, $lte: endOfDayDate } }, { dueDate: null }] },
          { dueDate: null, status: 'pending', createdAt: { $lte: endOfDayDate } },
          { dueDate: { $lt: startOfDayDate }, status: { $in: ['pending', 'migrated_future'] } },
        ];
        break;
      case 'weekly': {
        const startOfWeekDate = new Date(startOfDayDate);
        startOfWeekDate.setUTCDate(startOfWeekDate.getUTCDate() - startOfWeekDate.getUTCDay());
        startOfWeekDate.setUTCHours(0, 0, 0, 0);
        const endOfWeekDate = new Date(startOfWeekDate);
        endOfWeekDate.setUTCDate(endOfWeekDate.getUTCDate() + 6);
        endOfWeekDate.setUTCHours(23, 59, 59, 999);
        query.$or = [
          { dueDate: { $gte: startOfWeekDate, $lte: endOfWeekDate } },
          { status: 'completed', updatedAt: { $gte: startOfWeekDate, $lte: endOfWeekDate } },
          { dueDate: null, status: 'pending', createdAt: { $lte: endOfWeekDate } },
          { dueDate: { $lt: startOfWeekDate }, status: { $in: ['pending', 'migrated_future'] } },
        ];
        break;
      }
      case 'monthly': {
        const startOfMonthDate = new Date(Date.UTC(startOfDayDate.getUTCFullYear(), startOfDayDate.getUTCMonth(), 1, 0, 0, 0, 0));
        const endOfMonthDate = new Date(Date.UTC(startOfDayDate.getUTCFullYear(), startOfDayDate.getUTCMonth() + 1, 0, 23, 59, 59, 999));
        query.$or = [
          { dueDate: { $gte: startOfMonthDate, $lte: endOfMonthDate } },
          { status: 'completed', updatedAt: { $gte: startOfMonthDate, $lte: endOfMonthDate } },
          { dueDate: null, status: 'pending', createdAt: { $lte: endOfMonthDate } },
          { dueDate: { $lt: startOfMonthDate }, status: { $in: ['pending', 'migrated_future'] } },
        ];
        break;
      }
      case 'all':
        query.$or = [
          { dueDate: { $ne: null } },
          { status: 'completed' },
          { dueDate: null, status: 'pending' },
          { status: 'migrated_back' },
          { isBacklog: true },
        ];
        break;
      default:
        throw new Error('Invalid view type');
    }

    const tasks = await this.taskModel.find(query)
      .populate('parentTask', 'content status')
      .sort({ status: 1, dueDate: -1, priority: 1, createdAt: -1 });

    const tasksWithDates = tasks.map(t => t.toObject());
    const sorted = this.sortTasks(tasksWithDates, viewType);

    if (viewType === 'daily') {
      const dateKey = this.formatDateKey(startDate);
      const orderDoc = await TaskOrder.findOne({ userId, dateKey }).lean();
      if (orderDoc && Array.isArray(orderDoc.orderedTaskIds) && orderDoc.orderedTaskIds.length > 0) {
        const idToTask = new Map(sorted.map(t => [String(t._id), t]));
        const inOrder = orderDoc.orderedTaskIds.map(id => String(id)).filter(id => idToTask.has(id)).map(id => idToTask.get(id));
        const remaining = sorted.filter(t => !orderDoc.orderedTaskIds.map(x => String(x)).includes(String(t._id)));
        return [...inOrder, ...remaining];
      }
    }
    return sorted;
  }

  sortTasks(tasks) {
    return tasks.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
      if (a.dueDate && b.dueDate) return a.dueDate - b.dueDate;
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return (b.priority || 0) - (a.priority || 0);
    });
  }

  async saveDailyOrder({ userId, dateKey, orderedTaskIds }) {
    return TaskOrder.findOneAndUpdate(
      { userId, dateKey },
      { orderedTaskIds, updatedAt: new Date() },
      { new: true, upsert: true }
    );
  }

  async createTask(taskData) {
    return new this.taskModel(taskData).save();
  }

  async updateTask(taskId, updateData) {
    return this.taskModel.findByIdAndUpdate(taskId, { ...updateData, updatedAt: new Date() }, { new: true, runValidators: true });
  }

  async deleteTask(taskId) {
    const task = await this.taskModel.findById(taskId);
    if (!task) return null;
    if (task.parentTask) {
      await this.taskModel.findByIdAndUpdate(task.parentTask, { $pull: { subtasks: taskId } });
    }
    await this.taskModel.deleteMany({ parentTask: taskId });
    return this.taskModel.findByIdAndDelete(taskId);
  }

  async updateTaskStatus(taskId, status) {
    const now = new Date();
    const updateData = { status, updatedAt: now };
    if (status === 'completed') {
      updateData.completedAt = now;
    } else {
      updateData.completedAt = null;
    }
    return this.taskModel.findByIdAndUpdate(taskId, updateData, { new: true, runValidators: true });
  }

  async getTaskById(taskId) {
    return this.taskModel.findById(taskId).populate('parentTask', 'content status').populate('subtasks');
  }

  async getTagsForUser(userId) {
    return this.taskModel.aggregate([
      { $match: { createdBy: new mongoose.Types.ObjectId(userId) } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $project: { _id: 0, tag: '$_id', count: 1 } },
    ]);
  }

  async getTasksByTags(userId, tags) {
    const tasks = await this.taskModel.find({ createdBy: userId, tags: { $all: tags } }).sort({ dueDate: -1, createdAt: -1 });
    return tasks.map(t => t.toObject());
  }
}

export default new TaskService();
