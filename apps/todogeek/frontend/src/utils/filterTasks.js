/**
 * Shared task filter predicate — used by TaskList (rendering) and SearchPage
 * (export) so the "what counts as a match" logic lives in exactly one place.
 *
 * Filters shape (see context/TaskContext.jsx `filters` state):
 *   { search, status, priority, type, tags }
 * `type` maps to Task.signifier ('*' | '@' | '-' | '?' | ...).
 */
export function taskMatchesFilters(task, filters = {}) {
  const hasAnyFilter =
    filters.search || filters.status || filters.priority || filters.type ||
    (filters.tags && filters.tags.length > 0);

  if (!hasAnyFilter) return true;

  const search = (filters.search || '').toLowerCase();
  const matchesSearch = !search ||
    (task.content || '').toLowerCase().includes(search) ||
    (task.note || '').toLowerCase().includes(search) ||
    (task.tags || []).some((tag) => tag.toLowerCase().includes(search));

  const matchesStatus = !filters.status || task.status === filters.status;
  const matchesPriority = !filters.priority || task.priority === Number(filters.priority);
  const matchesType = !filters.type || task.signifier === filters.type;
  const matchesTags = !filters.tags?.length ||
    (task.tags && filters.tags.every((tag) => task.tags.includes(tag)));

  return matchesSearch && matchesStatus && matchesPriority && matchesType && matchesTags;
}

export function filterTasks(tasks, filters) {
  return (Array.isArray(tasks) ? tasks : []).filter((task) => taskMatchesFilters(task, filters));
}
