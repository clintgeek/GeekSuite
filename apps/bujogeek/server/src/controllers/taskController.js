import taskService from '../services/taskService.js';
import { handleError } from '../utils/errorHandler.js';
import { format } from 'date-fns';

// Create a new task
export const createTask = async (req, res) => {
  try {
    const taskData = {
      ...req.body,
      createdBy: req.user._id
    };

    // If custom dates are provided, use them
    if (req.body.createdAt) {
      taskData.createdAt = new Date(req.body.createdAt);
    }
    if (req.body.dueDate) {
      taskData.dueDate = new Date(req.body.dueDate);
    }
    if (req.body.updatedAt) {
      taskData.updatedAt = new Date(req.body.updatedAt);
    }

    const task = await taskService.createTask(taskData);
    res.status(201).json(task);
  } catch (error) {
    handleError(res, error);
  }
};

// Get tasks for a specific view
export const getTasks = async (req, res) => {
  try {
    const { viewType = 'all', startDate, endDate } = req.query;

    const tasks = await taskService.getTasksForDateRange({
      userId: req.user._id,
      startDate: startDate ? new Date(startDate) : new Date(),
      endDate: endDate ? new Date(endDate) : new Date(),
      viewType
    });

    res.json(tasks);
  } catch (error) {
    handleError(res, error);
  }
};

// Get a single task by ID
export const getTaskById = async (req, res) => {
  try {
    const task = await taskService.getTaskById(req.params.id);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    res.json(task);
  } catch (error) {
    handleError(res, error);
  }
};

// Update a task
export const updateTask = async (req, res) => {
  try {
    const task = await taskService.updateTask(req.params.id, req.body);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    res.json(task);
  } catch (error) {
    handleError(res, error);
  }
};

// Delete a task
export const deleteTask = async (req, res) => {
  try {
    const result = await taskService.deleteTask(req.params.id);
    if (!result) {
      return res.status(404).json({ message: 'Task not found' });
    }
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    handleError(res, error);
  }
};

// Update task status
export const updateTaskStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const task = await taskService.updateTaskStatus(req.params.id, status);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    res.json(task);
  } catch (error) {
    handleError(res, error);
  }
};

// Add subtask
export const addSubtask = async (req, res) => {
  try {
    const parentTask = await taskService.getTaskById(req.params.id);
    if (!parentTask) {
      return res.status(404).json({ message: 'Parent task not found' });
    }

    const subtaskData = {
      ...req.body,
      parentTask: parentTask._id,
      createdBy: req.user._id
    };

    const subtask = await taskService.createTask(subtaskData);
    res.status(201).json(subtask);
  } catch (error) {
    handleError(res, error);
  }
};

// Get tasks for daily log
export const getDailyTasks = async (req, res) => {
  try {
    const dateStr = req.query.date || format(new Date(), 'yyyy-MM-dd');
    const tasks = await taskService.getTasksForDateRange({
      userId: req.user._id,
      startDate: new Date(dateStr),
      endDate: new Date(dateStr),
      viewType: 'daily'
    });
    res.json(tasks);
  } catch (error) {
    handleError(res, error);
  }
};

// Get tasks for weekly view
export const getWeeklyTasks = async (req, res) => {
  try {
    const dateStr = req.query.date || format(new Date(), 'yyyy-MM-dd');
    const tasks = await taskService.getTasksForDateRange({
      userId: req.user._id,
      startDate: new Date(dateStr),
      endDate: new Date(dateStr),
      viewType: 'weekly'
    });
    res.json(tasks);
  } catch (error) {
    handleError(res, error);
  }
};

// Get tasks for monthly view
export const getMonthlyTasks = async (req, res) => {
  try {
    const startDate = req.query.startDate || format(new Date(), 'yyyy-MM-dd');
    const endDate = req.query.endDate || format(new Date(), 'yyyy-MM-dd');

    const tasks = await taskService.getTasksForDateRange({
      userId: req.user._id,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      viewType: 'monthly'
    });
    res.json(tasks);
  } catch (error) {
    handleError(res, error);
  }
};

// Get all tasks
export const getAllTasks = async (req, res) => {
  try {
    const tasks = await taskService.getTasksForDateRange({
      userId: req.user._id,
      startDate: new Date(),
      endDate: new Date(),
      viewType: 'all'
    });
    res.json(tasks);
  } catch (error) {
    handleError(res, error);
  }
};

// Migrate task to future date
export const migrateTaskToFuture = async (req, res) => {
  try {
    const { futureDate } = req.body;
    const task = await taskService.updateTask(req.params.id, {
      dueDate: new Date(futureDate),
      updatedAt: new Date()
    });

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    res.json(task);
  } catch (error) {
    handleError(res, error);
  }
};

// Save daily task order
export const saveDailyTaskOrder = async (req, res) => {
  try {
    const { dateKey, orderedTaskIds } = req.body;
    if (!dateKey || !Array.isArray(orderedTaskIds)) {
      return res.status(400).json({ message: 'dateKey and orderedTaskIds are required' });
    }
    const doc = await taskService.saveDailyOrder({
      userId: req.user._id,
      dateKey,
      orderedTaskIds
    });
    res.json({ success: true, updatedAt: doc.updatedAt });
  } catch (error) {
    handleError(res, error);
  }
};