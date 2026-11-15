/**
 * penKinds.js — which tasks are to-dos and which are only written down
 * (decision D4, DOCS/NOTEGEEK_TODOGEEK_REVIEW_2026-11.md Tier 6).
 *
 *   `-` a note    and   `@` an event
 *
 * have no checkbox, do not count as to-dos, and do not carry over: an event
 * is over when its day is, and a note stays where it was written. They still
 * show on their own day, in Upcoming, in Search and in Done (when something
 * already put them there). Everything else — `*`, `?`, `!`, `>`, `<`, `x`,
 * a plain task — is a to-do.
 *
 * Pure functions over a task, so the pages and the row agree.
 */
const NOT_TODOS = new Set(['-', '@']);

/** A note or an event: written down, not to be ticked. */
export const isRecordOnly = (task) => NOT_TODOS.has(task?.signifier);

/** Can this task be ticked off? */
export const isCheckable = (task) => !isRecordOnly(task);

/**
 * Today's sections with D4 applied: notes and events leave "carried over"
 * (their day has passed) and the "to do" count counts only to-dos.
 *
 * @param {{ overdue: object[], today: object[], anytime: object[], counts: { toDo: number, done: number } }} sections
 */
export function applyKinds(sections) {
  const overdue = sections.overdue.filter(isCheckable);
  const toDo = overdue.length
    + sections.today.filter(isCheckable).length
    + sections.anytime.filter(isCheckable).length;
  return { ...sections, overdue, counts: { ...sections.counts, toDo } };
}
