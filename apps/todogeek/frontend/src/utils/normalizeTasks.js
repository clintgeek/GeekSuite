/**
 * Normalize tasks from TaskContext into a flat array.
 * The context may store tasks as an array (daily view) or
 * as an object keyed by date (all/monthly views).
 */
export const normalizeTasks = (tasks) => {
  if (Array.isArray(tasks)) return tasks;
  if (tasks && typeof tasks === 'object') {
    return Object.values(tasks).flat();
  }
  return [];
};
