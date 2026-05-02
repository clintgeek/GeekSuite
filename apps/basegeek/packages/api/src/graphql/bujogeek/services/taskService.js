import Task from '../models/Task.js';
import TaskOrder from '../models/TaskOrder.js';
import mongoose from 'mongoose';
import { RRule, rrulestr } from 'rrule';

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
    const query = { createdBy: userId, isSeriesMaster: { $ne: true } };
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

    // --- RRULE EXPANSION START ---
    let viewStart, viewEnd;
    if (viewType === 'daily') {
      viewStart = startOfDayDate; viewEnd = endOfDayDate;
    } else if (viewType === 'weekly') {
      const startOfWeekDate = new Date(startOfDayDate);
      startOfWeekDate.setUTCDate(startOfWeekDate.getUTCDate() - startOfWeekDate.getUTCDay());
      startOfWeekDate.setUTCHours(0, 0, 0, 0);
      const endOfWeekDate = new Date(startOfWeekDate);
      endOfWeekDate.setUTCDate(endOfWeekDate.getUTCDate() + 6);
      endOfWeekDate.setUTCHours(23, 59, 59, 999);
      viewStart = startOfWeekDate; viewEnd = endOfWeekDate;
    } else if (viewType === 'monthly') {
      viewStart = new Date(Date.UTC(startOfDayDate.getUTCFullYear(), startOfDayDate.getUTCMonth(), 1, 0, 0, 0, 0));
      viewEnd = new Date(Date.UTC(startOfDayDate.getUTCFullYear(), startOfDayDate.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    } else {
      viewStart = new Date(0); viewEnd = new Date(8640000000000000);
    }

    const masterTasks = await this.taskModel.find({
      createdBy: userId,
      isSeriesMaster: true,
      status: { $ne: 'completed' }
    });

    const overrides = await this.taskModel.find({
      createdBy: userId,
      seriesId: { $in: masterTasks.map(m => m._id) }
    });
    const overrideMap = new Map();
    for (const ov of overrides) {
      if (ov.originalDueDate) {
        overrideMap.set(`${ov.seriesId}_${ov.originalDueDate.getTime()}`, ov);
      }
    }

    for (const master of masterTasks) {
      if (!master.recurrenceRule) continue;
      try {
        const rule = rrulestr(master.recurrenceRule);
        const occurrences = rule.between(viewStart, viewEnd, true);

        for (const date of occurrences) {
          if (master.exdates && master.exdates.some(ex => ex.getTime() === date.getTime())) continue;

          const key = `${master._id}_${date.getTime()}`;
          if (!overrideMap.has(key)) {
            tasksWithDates.push({
              _id: `virtual_${master._id}_${date.getTime()}`,
              content: master.content,
              signifier: master.signifier,
              status: 'pending',
              priority: master.priority,
              note: master.note,
              tags: master.tags,
              dueDate: date,
              originalDueDate: date,
              seriesId: master._id,
              recurrenceRule: master.recurrenceRule,
              isVirtual: true,
              createdBy: master.createdBy
            });
          }
        }

        // Carry-forward logic for daily/all view
        if (viewType === 'daily' || viewType === 'all') {
          const pastDate = rule.before(viewStart, false);
          if (pastDate) {
            let skipPast = false;
            if (master.exdates && master.exdates.some(ex => ex.getTime() === pastDate.getTime())) skipPast = true;
            
            if (!skipPast) {
              const pastKey = `${master._id}_${pastDate.getTime()}`;
              const pastOverride = overrideMap.get(pastKey);
              if (!pastOverride) {
                tasksWithDates.push({
                  _id: `virtual_${master._id}_${pastDate.getTime()}`,
                  content: master.content,
                  signifier: master.signifier,
                  status: 'pending',
                  priority: master.priority,
                  note: master.note,
                  tags: master.tags,
                  dueDate: pastDate,
                  originalDueDate: pastDate,
                  seriesId: master._id,
                  recurrenceRule: master.recurrenceRule,
                  isVirtual: true,
                  createdBy: master.createdBy
                });
              }
            }
          }
        }
      } catch (e) {
        console.error("Invalid RRULE on task", master._id, e);
      }
    }
    // --- RRULE EXPANSION END ---

    const sorted = this.sortTasks(tasksWithDates);

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
    if (taskData.recurrenceRule) {
      taskData.isSeriesMaster = true;
    }
    return new this.taskModel(taskData).save();
  }

  async updateTask(taskId, updateData, editScope = 'THIS_INSTANCE') {
    if (taskId.startsWith('virtual_')) {
      const parts = taskId.split('_');
      const masterId = parts[1];
      const originalDueDate = new Date(parseInt(parts[2], 10));

      if (editScope === 'ALL_INSTANCES') {
        return this.taskModel.findByIdAndUpdate(masterId, { ...updateData, updatedAt: new Date() }, { new: true, runValidators: true });
      } else {
        const master = await this.taskModel.findById(masterId);
        const overrideData = {
          ...master.toObject(),
          _id: undefined,
          ...updateData,
          seriesId: masterId,
          isSeriesMaster: false,
          recurrenceRule: null,
          originalDueDate,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        return new this.taskModel(overrideData).save();
      }
    } else {
      const task = await this.taskModel.findById(taskId);
      if (task && (task.isSeriesMaster || editScope === 'ALL_INSTANCES')) {
        const targetId = task.seriesId || taskId;
        return this.taskModel.findByIdAndUpdate(targetId, { ...updateData, updatedAt: new Date() }, { new: true });
      } else {
        return this.taskModel.findByIdAndUpdate(taskId, { ...updateData, updatedAt: new Date() }, { new: true, runValidators: true });
      }
    }
  }

  async deleteTask(taskId, editScope = 'THIS_INSTANCE') {
    if (taskId.startsWith('virtual_')) {
      const parts = taskId.split('_');
      const masterId = parts[1];
      const originalDueDate = new Date(parseInt(parts[2], 10));

      if (editScope === 'ALL_INSTANCES') {
        await this.taskModel.deleteMany({ seriesId: masterId });
        return this.taskModel.findByIdAndDelete(masterId);
      } else {
        return this.taskModel.findByIdAndUpdate(masterId, { $push: { exdates: originalDueDate } }, { new: true });
      }
    }

    const task = await this.taskModel.findById(taskId);
    if (!task) return null;

    if (task.isSeriesMaster || editScope === 'ALL_INSTANCES') {
      const targetId = task.seriesId || taskId;
      await this.taskModel.deleteMany({ seriesId: targetId });
      return this.taskModel.findByIdAndDelete(targetId);
    } else {
      if (task.parentTask) {
        await this.taskModel.findByIdAndUpdate(task.parentTask, { $pull: { subtasks: taskId } });
      }
      await this.taskModel.deleteMany({ parentTask: taskId });
      return this.taskModel.findByIdAndDelete(taskId);
    }
  }

  nextRecurrenceDate(baseDate, pattern) {
    const d = new Date(baseDate || Date.now());
    switch (pattern) {
      case 'daily': d.setUTCDate(d.getUTCDate() + 1); break;
      case 'weekly': d.setUTCDate(d.getUTCDate() + 7); break;
      case 'monthly': d.setUTCMonth(d.getUTCMonth() + 1); break;
      default: return null;
    }
    d.setUTCHours(9, 0, 0, 0);
    return d;
  }

  async updateTaskStatus(taskId, status) {
    const now = new Date();
    const updateData = { status, updatedAt: now };
    if (status === 'completed') {
      updateData.completedAt = now;
    } else {
      updateData.completedAt = null;
    }

    if (taskId.startsWith('virtual_')) {
      const parts = taskId.split('_');
      const masterId = parts[1];
      const originalDueDate = new Date(parseInt(parts[2], 10));
      const master = await this.taskModel.findById(masterId);
      const overrideData = {
        ...master.toObject(),
        _id: undefined,
        ...updateData,
        seriesId: masterId,
        isSeriesMaster: false,
        recurrenceRule: null,
        originalDueDate,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      return new this.taskModel(overrideData).save();
    }

    const task = await this.taskModel.findByIdAndUpdate(taskId, updateData, { new: true, runValidators: true });

    // Legacy auto-spawn for basic non-rrule recurrences
    if (task && !task.isSeriesMaster && !task.seriesId && status === 'completed' && task.recurrencePattern && task.recurrencePattern !== 'none') {
      const nextDue = this.nextRecurrenceDate(task.dueDate, task.recurrencePattern);
      if (nextDue) {
        const startOfDay = new Date(nextDue); startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(nextDue); endOfDay.setUTCHours(23, 59, 59, 999);
        const existing = await this.taskModel.findOne({
          createdBy: task.createdBy,
          content: task.content,
          recurrencePattern: task.recurrencePattern,
          status: 'pending',
          dueDate: { $gte: startOfDay, $lte: endOfDay },
        });
        if (!existing) {
          await this.taskModel.create({
            content: task.content, signifier: task.signifier, status: 'pending', priority: task.priority,
            note: task.note, tags: task.tags, dueDate: nextDue, originalDate: nextDue,
            recurrencePattern: task.recurrencePattern, createdBy: task.createdBy,
          });
        }
      }
    }

    return task;
  }

  async getTaskById(taskId) {
    if (taskId.startsWith('virtual_')) {
      return null;
    }
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
