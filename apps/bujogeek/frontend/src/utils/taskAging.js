import { differenceInDays } from 'date-fns';
import { colors } from '../theme/colors';

/**
 * Calculate how old a task is based on its original date or creation date.
 * Returns an aging level and associated day count.
 */
export const getTaskAge = (task) => {
  const referenceDate = task.originalDate || task.dueDate || task.createdAt;
  if (!referenceDate) return { level: 'fresh', days: 0 };

  const days = differenceInDays(new Date(), new Date(referenceDate));

  if (days <= 0) return { level: 'fresh', days };
  if (days <= 2) return { level: 'warning', days };
  if (days <= 7) return { level: 'overdue', days };
  return { level: 'stale', days };
};

/**
 * Get the left border color for a task based on its aging level.
 */
export const getAgingColor = (level) => {
  return colors.aging[level] || colors.aging.fresh;
};

/**
 * Get a human-readable age label.
 */
export const getAgingLabel = (days) => {
  if (days <= 0) return null;
  if (days === 1) return 'yesterday';
  if (days <= 7) return `${days} days ago`;
  if (days <= 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
};
