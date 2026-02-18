import Task from '../models/Task.js';
import TaskOrder from '../models/TaskOrder.js';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO } from 'date-fns';

class TaskService {
  constructor() {
    this.taskModel = Task;
  }

  /**
   * Convert a date to UTC for MongoDB queries
   * @param {Date} date - The date to convert
   * @returns {Date} UTC date
   */
  getUtcDate(date) {
    const d = new Date(date);
    return new Date(d.getTime() + d.getTimezoneOffset() * 60000);
  }

  /**
   * Get tasks for a specific date range
   * @param {Object} params - Query parameters
   * @param {string} params.userId - User ID
   * @param {Date} params.startDate - Start date
   * @param {Date} params.endDate - End date
   * @param {string} params.viewType - View type (daily, weekly, monthly, all)
   * @returns {Promise<Array>} Array of tasks
   */
  async getTasksForDateRange({ userId, startDate, endDate, viewType }) {
    const query = {
      createdBy: userId,
      isBacklog: false
    };

    // Convert input date to UTC
    const utcDate = this.getUtcDate(startDate);
    const utcYear = utcDate.getUTCFullYear();
    const utcMonth = utcDate.getUTCMonth();
    const utcDay = utcDate.getUTCDate();

    // Create start and end of day in UTC
    const startOfDayDate = new Date(Date.UTC(utcYear, utcMonth, utcDay, 0, 0, 0, 0));
    const endOfDayDate = new Date(Date.UTC(utcYear, utcMonth, utcDay, 23, 59, 59, 999));

    // Add date range based on view type
    switch (viewType) {
      case 'daily':
        query.$or = [
          // 1. Tasks due on this day (regardless of status)
          {
            dueDate: {
              $gte: startOfDayDate,
              $lte: endOfDayDate
            }
          },
          // 2. Tasks completed on this day that were either due today or had no due date
          {
            status: 'completed',
            updatedAt: {
              $gte: startOfDayDate,
              $lte: endOfDayDate
            },
            $or: [
              { dueDate: { $gte: startOfDayDate, $lte: endOfDayDate } },
              { dueDate: null }
            ]
          },
          // 3. Incomplete, unscheduled tasks created on or before this day (rolling forward)
          {
            dueDate: null,
            status: 'pending',
            createdAt: {
              $lte: endOfDayDate
            }
          },
          // 4. Past-due tasks that are still incomplete (carry forward)
          {
            dueDate: { $lt: startOfDayDate },
            status: { $in: ['pending', 'migrated_future'] }
          }
        ];
        break;
      case 'weekly':
        // Get start of week (Sunday) in UTC
        const startOfWeekDate = new Date(Date.UTC(utcYear, utcMonth, utcDay - utcDate.getUTCDay(), 0, 0, 0, 0));
        const endOfWeekDate = new Date(startOfWeekDate);
        endOfWeekDate.setUTCDate(endOfWeekDate.getUTCDate() + 6);
        endOfWeekDate.setUTCHours(23, 59, 59, 999);

        query.$or = [
          // 1. Tasks due this week (regardless of status)
          {
            dueDate: {
              $gte: startOfWeekDate,
              $lte: endOfWeekDate
            }
          },
          // 2. Tasks completed this week
          {
            status: 'completed',
            updatedAt: {
              $gte: startOfWeekDate,
              $lte: endOfWeekDate
            }
          },
          // 3. Incomplete, unscheduled tasks created on or before the end of this week
          {
            dueDate: null,
            status: 'pending',
            createdAt: {
              $lte: endOfWeekDate
            }
          },
          // 4. Past-due tasks from before this week that are still incomplete
          {
            dueDate: { $lt: startOfWeekDate },
            status: { $in: ['pending', 'migrated_future'] }
          }
        ];
        break;
      case 'monthly':
        // Get start of month in UTC
        const startOfMonthDate = new Date(Date.UTC(utcYear, utcMonth, 1, 0, 0, 0, 0));
        const endOfMonthDate = new Date(Date.UTC(utcYear, utcMonth + 1, 0, 23, 59, 59, 999));

        query.$or = [
          // 1. Tasks due in this month (regardless of status)
          {
            dueDate: {
              $gte: startOfMonthDate,
              $lte: endOfMonthDate
            }
          },
          // 2. Tasks completed in this month (regardless of due date)
          {
            status: 'completed',
            updatedAt: {
              $gte: startOfMonthDate,
              $lte: endOfMonthDate
            }
          },
          // 3. Incomplete, unscheduled tasks created on or before the end of this month (rolling forward)
          {
            dueDate: null,
            status: 'pending',
            createdAt: {
              $lte: endOfMonthDate
            }
          },
          // 4. Past-due tasks from before this month that are still incomplete
          {
            dueDate: { $lt: startOfMonthDate },
            status: { $in: ['pending', 'migrated_future'] }
          }
        ];
        break;
      case 'all':
        // For 'all' view, we want to group tasks by their relevant dates
        query.$or = [
          // 1. All tasks with due dates
          {
            dueDate: { $ne: null }
          },
          // 2. All completed tasks
          {
            status: 'completed'
          },
          // 3. Incomplete, unscheduled tasks
          {
            dueDate: null,
            status: 'pending'
          }
        ];
        break;
      default:
        throw new Error('Invalid view type');
    }

    const tasks = await this.taskModel.find(query)
      .populate('parentTask', 'content status')
      .sort({
        status: 1, // pending first
        dueDate: -1, // newest scheduled tasks first
        priority: 1, // high priority first
        createdAt: -1 // newest first
      });

    // Convert to plain objects
    const tasksWithDates = tasks.map(task => task.toObject());

    const sorted = Array.isArray(tasksWithDates) ? this.sortTasks(tasksWithDates, viewType) : [];

    // If daily view, overlay user-defined order for that date
    if (viewType === 'daily') {
      const dateKey = this.formatDateKey(startDate);
      const orderDoc = await TaskOrder.findOne({ userId, dateKey }).lean();
      if (orderDoc && Array.isArray(orderDoc.orderedTaskIds) && orderDoc.orderedTaskIds.length > 0) {
        const idToTask = new Map(sorted.map(t => [String(t._id), t]));
        const inOrder = orderDoc.orderedTaskIds
          .map(id => String(id))
          .filter(id => idToTask.has(id))
          .map(id => idToTask.get(id));
        const remaining = sorted.filter(t => !orderDoc.orderedTaskIds.map(x => String(x)).includes(String(t._id)));
        return [...inOrder, ...remaining];
      }
    }

    return sorted;
  }

  /**
   * Sort tasks according to the sorting rules
   * @param {Array} tasks - Array of tasks to sort
   * @param {string} viewType - View type
   * @returns {Array} Sorted tasks
   */
  sortTasks(tasks, viewType) {
    return tasks.sort((a, b) => {
      // First, sort by completion status
      if (a.status !== b.status) {
        return a.status === 'pending' ? -1 : 1;
      }

      // Then, sort by scheduled date
      if (a.dueDate && b.dueDate) {
        return a.dueDate - b.dueDate;
      }
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;

      // Finally, sort by priority
      if (a.priority !== b.priority) {
        return (b.priority || 0) - (a.priority || 0);
      }

      return 0;
    });
  }

  formatDateKey(date) {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  async saveDailyOrder({ userId, dateKey, orderedTaskIds }) {
    const doc = await TaskOrder.findOneAndUpdate(
      { userId, dateKey },
      { orderedTaskIds, updatedAt: new Date() },
      { new: true, upsert: true }
    );
    return doc;
  }

  /**
   * Create a new task
   * @param {Object} taskData - Task data
   * @returns {Promise<Object>} Created task
   */
  async createTask(taskData) {
    const task = new this.taskModel(taskData);
    return task.save();
  }

  /**
   * Update a task
   * @param {string} taskId - Task ID
   * @param {Object} updateData - Update data
   * @returns {Promise<Object>} Updated task
   */
  async updateTask(taskId, updateData) {
    return this.taskModel.findByIdAndUpdate(
      taskId,
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    );
  }

  /**
   * Delete a task
   * @param {string} taskId - Task ID
   * @returns {Promise<Object>} Deletion result
   */
  async deleteTask(taskId) {
    const task = await this.taskModel.findById(taskId);
    if (!task) return null;

    // Remove from parent's subtasks if exists
    if (task.parentTask) {
      await this.taskModel.findByIdAndUpdate(task.parentTask, {
        $pull: { subtasks: taskId }
      });
    }

    // Delete all subtasks
    await this.taskModel.deleteMany({ parentTask: taskId });

    // Delete the task itself
    return this.taskModel.findByIdAndDelete(taskId);
  }

  /**
   * Update task status
   * @param {string} taskId - Task ID
   * @param {string} status - New status
   * @returns {Promise<Object>} Updated task
   */
  async updateTaskStatus(taskId, status) {
    const now = new Date();
    const updateData = {
      status,
      updatedAt: now
    };

    // Set or clear completedAt based on status
    if (status === 'completed') {
      updateData.completedAt = now;
    } else {
      updateData.completedAt = null;  // Clear completedAt if task is uncompleted
    }

    return this.taskModel.findByIdAndUpdate(
      taskId,
      updateData,
      { new: true, runValidators: true }
    );
  }

  /**
   * Get a task by ID
   * @param {string} taskId - Task ID
   * @returns {Promise<Object>} Task object
   */
  async getTaskById(taskId) {
    return this.taskModel.findById(taskId)
      .populate('parentTask', 'content status')
      .populate('subtasks');
  }
}

export default new TaskService();