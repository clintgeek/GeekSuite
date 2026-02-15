import { format, isSameDay, eachDayOfInterval } from 'date-fns';

/**
 * Core task filtering and grouping utility
 * @param {Array} tasks - Array of task objects
 * @param {Object} options - Configuration options
 * @param {Date} options.startDate - Start of date range
 * @param {Date} options.endDate - End of date range
 * @param {Date} options.today - Reference date for "today" (defaults to current date)
 * @param {Object} options.filters - Additional filtering options
 * @param {boolean} options.includeCompleted - Whether to include completed tasks
 * @param {boolean} options.includeUnscheduled - Whether to include unscheduled tasks
 * @param {boolean} options.includePastDue - Whether to include past due tasks
 * @returns {Object} - Object with dates as keys and arrays of tasks as values
 */
export const getTasksForDates = (tasks, options = {}) => {
  const {
    startDate = null,
    endDate = null,
    today = new Date(),
    filters = {},
    includeCompleted = true,
    includeUnscheduled = true,
    includePastDue = true
  } = options;

  // Normalize dates
  today.setHours(0, 0, 0, 0);
  if (startDate) startDate.setHours(0, 0, 0, 0);
  if (endDate) endDate.setHours(0, 0, 0, 0);

  // Generate all dates in the range
  const dateRange = generateDateRange(startDate, endDate);

  // Initialize result object with empty arrays for each date
  const result = {};
  dateRange.forEach(date => {
    result[format(date, 'yyyy-MM-dd')] = [];
  });

  // Process each task
  tasks.forEach(task => {
    const taskDate = determineTaskDate(task, today, {
      includeCompleted,
      includeUnscheduled,
      includePastDue
    });

    // If task date falls within range, add it to the result
    if (taskDate && (!startDate || taskDate >= startDate) && (!endDate || taskDate <= endDate)) {
      const dateKey = format(taskDate, 'yyyy-MM-dd');
      if (result[dateKey]) {
        result[dateKey].push(task);
      }
    }
  });

  // Sort tasks within each date
  Object.keys(result).forEach(date => {
    result[date] = sortTasks(result[date]);
  });

  return result;
};

/**
 * Helper to determine which date a task should appear on
 */
const determineTaskDate = (task, today, options) => {
  const { includeCompleted, includeUnscheduled, includePastDue } = options;
  const taskDueDate = task.dueDate ? new Date(task.dueDate) : null;
  if (taskDueDate) taskDueDate.setHours(0, 0, 0, 0);

  // Completed tasks show on completion date
  if (task.status === 'completed' && includeCompleted) {
    const completedDate = new Date(task.updatedAt);
    completedDate.setHours(0, 0, 0, 0);
    return completedDate;
  }

  // Tasks with due dates
  if (taskDueDate) {
    // Future tasks show on due date
    if (taskDueDate > today) {
      return taskDueDate;
    }
    // Past due tasks show on today
    if (taskDueDate < today && includePastDue) {
      return today;
    }
    // Today's tasks show on today
    if (isSameDay(taskDueDate, today)) {
      return today;
    }
  }

  // Unscheduled tasks show on today
  if (!task.dueDate && includeUnscheduled && task.status === 'pending' && !task.isBacklog) {
    return today;
  }

  return null;
};

/**
 * Helper to generate array of dates in a range
 */
const generateDateRange = (startDate, endDate) => {
  if (!startDate || !endDate) return [];
  return eachDayOfInterval({ start: startDate, end: endDate });
};

/**
 * Helper to sort tasks within a date
 */
const sortTasks = (tasks) => {
  return tasks.sort((a, b) => {
    // Sort by priority first
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    // Then by due date
    if (a.dueDate && b.dueDate) {
      return new Date(a.dueDate) - new Date(b.dueDate);
    }
    // Then by creation date
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
};