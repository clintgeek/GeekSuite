// ─── Task sorting ────────────────────────────────────────────────────────────
// Authoritative spec: DOCS/SORTING_RULES.md
//   1. Incomplete tasks
//        a. Scheduled (has a dueDate)   — sorted by priority
//        b. Non-scheduled (no dueDate)  — sorted by priority
//   2. Completed / cancelled tasks      — sink below, cancelled last
// Priority is an Int on the schema (Task.priority, min 1 max 3, default null):
//   1 = High, 2 = Medium, 3 = Low, null/undefined = None (sorts last).
//
// Pure module (no React/Apollo/MUI imports) so the comparator — which was once
// silently broken with NaN comparisons — is unit-testable in isolation.

const PRIORITY_NONE = Number.MAX_SAFE_INTEGER;

const priorityRank = (task) => {
  const p = Number(task?.priority);
  return Number.isFinite(p) && p > 0 ? p : PRIORITY_NONE;
};

const dueTime = (task) => {
  if (!task?.dueDate) return null;
  const t = new Date(task.dueDate).getTime();
  return Number.isNaN(t) ? null : t;
};

const SUNK_STATUSES = new Set(['completed', 'cancelled']);

/**
 * The single authoritative task comparator. Used everywhere tasks are ordered.
 * Do not inline a second copy.
 */
export const compareTasks = (a, b) => {
  // 1. Completed / cancelled tasks sink below incomplete ones.
  const aDone = SUNK_STATUSES.has(a?.status) ? 1 : 0;
  const bDone = SUNK_STATUSES.has(b?.status) ? 1 : 0;
  if (aDone !== bDone) return aDone - bDone;

  // Within the sunk group, cancelled sorts after completed (spec doesn't
  // define an order between them — default to cancelled-last).
  if (aDone && a?.status !== b?.status) {
    if (a?.status === 'cancelled') return 1;
    if (b?.status === 'cancelled') return -1;
  }

  const aDue = dueTime(a);
  const bDue = dueTime(b);

  // 2. Within incomplete tasks, scheduled comes before non-scheduled.
  if (!aDone) {
    const aScheduled = aDue === null ? 1 : 0;
    const bScheduled = bDue === null ? 1 : 0;
    if (aScheduled !== bScheduled) return aScheduled - bScheduled;
  }

  // 3. Priority: High(1) → Medium(2) → Low(3) → None.
  const aPriority = priorityRank(a);
  const bPriority = priorityRank(b);
  if (aPriority !== bPriority) return aPriority - bPriority;

  // 4. Tiebreak on due date (earliest first, undated last).
  if (aDue !== bDue) {
    if (aDue === null) return 1;
    if (bDue === null) return -1;
    return aDue - bDue;
  }

  return 0;
};

export const sortTasks = (tasks) => {
  if (!Array.isArray(tasks)) return tasks;
  return [...tasks].sort(compareTasks);
};
