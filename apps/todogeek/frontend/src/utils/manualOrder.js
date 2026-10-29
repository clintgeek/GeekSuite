/**
 * manualOrder.js — Today's drag-to-reorder, as pure functions
 * (DOCS/SORTING_RULES.md § "Manual order (Today)").
 *
 * A day's manual order is ONE list of ids, saved per LOCAL day (`yyyy-MM-dd`)
 * through `saveDailyTaskOrder`: the Today section's ids, then the Anytime
 * section's. Tomorrow has no saved order, so it starts from the normal rule.
 *
 * Applying it to a section (Chef, 2026-10-29):
 *   1. start from the auto-sorted section (penViews.compareWithinDay);
 *   2. the saved ids keep their saved relative order — the dragged arrangement
 *      is kept exactly;
 *   3. a task that is NOT in the saved order (new today, or put on today since)
 *      goes immediately before the first saved task the comparator places
 *      after it, or at the end. Several such tasks before the same saved task
 *      keep their auto order among themselves.
 * Saved ids that are no longer in the section (done, deleted, moved to
 * another day) are simply not there; nothing else moves.
 *
 * ## A task that changed section
 * The saved list is a Today block followed by an Anytime block, but which
 * block an id was in is not stored. It is inferred: the seam is put where it
 * best explains the sections the saved tasks are in NOW (the fewest tasks on
 * the wrong side of it), and a task on the wrong side of that seam has moved
 * between Today and Anytime since the save — it is placed like a new task
 * (rule 3). When two seams explain the sections equally well, every task
 * they disagree about is placed by rule 3 — the moved task always is; a
 * neighbour may be too. When it sat right at the seam (the last of Today, the
 * first of Anytime) nothing tells the two apart and it keeps its place there,
 * which is next to where it was on screen anyway.
 *
 * ## Repeating tasks
 * A virtual occurrence's id is `virtual_<seriesId>_<epochMs>`. Editing just
 * that occurrence turns it into a real task carrying `seriesId` and its
 * `originalDate`; it answers to its old virtual id too, so it keeps its place.
 */
import { compareWithinDay, taskId } from './penViews';

/** The ids a task answers to in a saved order: its own, and its virtual one if it was an occurrence. */
export function orderKeys(task) {
  const id = taskId(task);
  const keys = [id];
  if (!id.startsWith('virtual_') && task?.seriesId && task?.originalDate) {
    const ms = new Date(task.originalDate).getTime();
    if (!Number.isNaN(ms)) keys.push(`virtual_${task.seriesId}_${ms}`);
  }
  return keys;
}

/** The saved position of a task, or -1. */
const savedIndexOf = (task, index) => {
  for (const key of orderKeys(task)) {
    if (index.has(key)) return index.get(key);
  }
  return -1;
};

/**
 * One section in manual order. `kept` are the section's tasks with their
 * saved index; everything else in `autoSorted` is placed by rule 3.
 */
function placeSection(autoSorted, keptIndex, compare) {
  const kept = autoSorted
    .filter((t) => keptIndex.has(t))
    .sort((a, b) => keptIndex.get(a) - keptIndex.get(b));
  if (!kept.length) return autoSorted.slice();
  const before = kept.map(() => []);
  const after = [];
  for (const task of autoSorted) {
    if (keptIndex.has(task)) continue;
    const at = kept.findIndex((k) => compare(task, k) < 0);
    (at < 0 ? after : before[at]).push(task);
  }
  const out = [];
  kept.forEach((k, i) => { out.push(...before[i], k); });
  return [...out, ...after];
}

/**
 * Today's two sortable sections in manual order.
 *
 * @param {{ today: object[], anytime: object[] }} sections  auto-sorted (penViews.todaySections)
 * @param {string[]} savedIds  the day's saved order, Today block then Anytime block
 * @param {(a, b) => number} compare  the normal rule
 * @returns {{ today: object[], anytime: object[] }}
 */
export function manualSections({ today = [], anytime = [] }, savedIds, compare = compareWithinDay) {
  if (!Array.isArray(savedIds) || !savedIds.length) return { today: today.slice(), anytime: anytime.slice() };
  const index = new Map();
  savedIds.forEach((id, i) => { if (!index.has(String(id))) index.set(String(id), i); });

  // Every saved task still on the page, with its saved index and where it is now.
  const placed = [];
  for (const t of today) { const i = savedIndexOf(t, index); if (i >= 0) placed.push({ t, i, now: 'today' }); }
  for (const t of anytime) { const i = savedIndexOf(t, index); if (i >= 0) placed.push({ t, i, now: 'anytime' }); }
  placed.sort((a, b) => a.i - b.i);

  // The seam: the k (0..n) with the fewest tasks on the wrong side of it
  // (an Anytime task before k, a Today task from k on). Two seams can explain
  // the sections equally well — "high moved to Anytime" or "low moved to
  // Today" — so a task is KEPT only when every best seam agrees it is on its
  // side; any task they disagree about is placed like a new one.
  const wrongAt = [];
  let todayFrom = placed.filter((p) => p.now === 'today').length;
  let anytimeBefore = 0;
  wrongAt.push(todayFrom);
  for (let k = 1; k <= placed.length; k += 1) {
    if (placed[k - 1].now === 'today') todayFrom -= 1;
    else anytimeBefore += 1;
    wrongAt.push(todayFrom + anytimeBefore);
  }
  const best = Math.min(...wrongAt);
  const firstSeam = wrongAt.indexOf(best);
  const lastSeam = wrongAt.lastIndexOf(best);

  const keptToday = new Map();
  const keptAnytime = new Map();
  placed.forEach((p, k) => {
    if (p.now === 'today' && k < firstSeam) keptToday.set(p.t, p.i);
    if (p.now === 'anytime' && k >= lastSeam) keptAnytime.set(p.t, p.i);
  });

  return {
    today: placeSection(today, keptToday, compare),
    anytime: placeSection(anytime, keptAnytime, compare),
  };
}

/** What gets saved: the Today ids, then the Anytime ids. */
export const orderForSave = ({ today = [], anytime = [] }) => [...today, ...anytime].map(taskId);

/**
 * Put a reordered SUBSET back into the full list: the subset's slots in
 * `fullIds` take the subset's new order, everything else stays put. (A pinned
 * tag filter shows part of a section; dragging there must not move the
 * hidden tasks.) Ids in `subsetIds` that `fullIds` lacks go on the end.
 */
export function reorderSubset(fullIds, subsetIds) {
  const wanted = new Set(subsetIds);
  const queue = subsetIds.filter((id) => fullIds.includes(id));
  const out = fullIds.map((id) => (wanted.has(id) ? queue.shift() : id));
  return [...out, ...subsetIds.filter((id) => !fullIds.includes(id))];
}

/** `ids` with `id` moved `delta` places (clamped); the same array when it cannot move. */
export function moveIdBy(ids, id, delta) {
  const from = ids.indexOf(id);
  if (from < 0) return ids;
  const to = Math.min(Math.max(from + delta, 0), ids.length - 1);
  if (to === from) return ids;
  const next = ids.slice();
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}
