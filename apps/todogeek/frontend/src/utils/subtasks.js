/**
 * subtasks.js — the pure half of the subtask feature.
 *
 * Everything here is a function of a task (or a list of them) and nothing
 * else: no Apollo, no MUI, no clock. That is deliberate — the nesting rule
 * below is the kind of thing that is easy to get subtly wrong and impossible
 * to test through a rendered row.
 *
 * The model: a subtask is an ordinary task carrying `parentTask`, and its
 * parent keeps an ordered `subtasks` array. Both sides come back from the
 * gateway, which leaves the client one genuine decision to make — see
 * `splitNested`.
 */

const idOf = (task) => String(task?.id ?? task?._id ?? '');

/** Statuses that count as "this step is finished". */
const DONE = new Set(['completed']);

/**
 * The `2/5` chip: how many of an entry's steps are done, out of how many.
 * Cancelled steps still count toward the total — a step you struck out is a
 * decision, not a disappearance, and hiding it would make the chip lie about
 * what is on screen when the row is expanded.
 */
export const subtaskProgress = (task) => {
  const subtasks = Array.isArray(task?.subtasks) ? task.subtasks : [];
  return {
    total: subtasks.length,
    done: subtasks.filter((child) => DONE.has(child?.status)).length,
  };
};

export const hasSubtasks = (task) => subtaskProgress(task).total > 0;

/**
 * True when an entry has steps and every one of them is finished — the moment
 * the UI offers (never forces) completing the parent.
 */
export const allSubtasksComplete = (task) => {
  const { total, done } = subtaskProgress(task);
  return total > 0 && done === total;
};

/**
 * Split a flat list of tasks into the rows to render and the children those
 * rows own.
 *
 * The gateway does not hide subtasks from the log views, and it is right not
 * to: a step with its own due date is real work on a real day. But a step
 * whose parent is on the SAME screen must not appear twice — once as its own
 * row and once nested under the parent it belongs to.
 *
 * So the rule is *presence*, not parentage:
 *   - a task whose parent is also in this list is removed from the top level
 *     (the parent's expander is where it lives), and
 *   - a task whose parent is elsewhere — filed in a collection, due another
 *     day, already completed off-screen — keeps its own row and shows the
 *     parent as a caption instead.
 *
 * Returns `{ rows, nestedIds }`. `nestedIds` is the set that was folded away,
 * so a caller can keep counts (a section header, a keyboard nav list) honest.
 */
export const splitNested = (tasks) => {
  const list = Array.isArray(tasks) ? tasks : [];
  const present = new Set(list.map(idOf).filter(Boolean));
  const nestedIds = new Set();

  const rows = list.filter((task) => {
    const parentId = idOf(task?.parentTask);
    if (!parentId || !present.has(parentId)) return true;
    nestedIds.add(idOf(task));
    return false;
  });

  return { rows, nestedIds };
};

/**
 * The children of `task` in the order the writer put them in, as the parent's
 * own `subtasks` array already gives them. Kept as a named helper so a caller
 * never has to remember whether the array can be null.
 */
export const orderedSubtasks = (task) =>
  (Array.isArray(task?.subtasks) ? task.subtasks : []);

/**
 * Move the subtask at `from` to `to`, returning the new id order to send to
 * `reorderSubtasks`. Out-of-range moves are no-ops rather than errors: the
 * buttons that call this are at the ends of the list half the time.
 */
export const reorderedSubtaskIds = (task, from, to) => {
  const children = orderedSubtasks(task);
  const ids = children.map(idOf);
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) {
    return ids;
  }
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

/**
 * The caption an orphaned step shows in a log view: which entry it is a step
 * of. Null when the task is not a step, or when the parent came back without
 * enough of itself to name.
 */
export const parentCaption = (task) => {
  const parent = task?.parentTask;
  if (!parent) return null;
  const content = String(parent.content ?? '').trim();
  return content || null;
};

export { idOf as subtaskId };
