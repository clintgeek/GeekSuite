import { toDate } from './dateUtils';

/**
 * Group a date-sorted list of notes into recency buckets, in LOCAL time.
 *
 *   Today · Yesterday · This week (the five days before yesterday) ·
 *   then one bucket per calendar month: "September", or "August 2025"
 *   once the year differs from `now`'s.
 *
 * "Today" is the writer's calendar day, not a rolling 24h window and not the
 * UTC date — a note written at 11pm is not "yesterday" because the server
 * clock is in another zone (the fitnessgeek UTC-"today" bug, 2026-09-20).
 *
 * Order is preserved: the buckets appear in the order their first note does,
 * and notes keep their order inside a bucket, so this works for both the
 * "Recent" (updatedAt) and "Created" (createdAt) sorts. A note with no usable
 * date lands in "Earlier".
 *
 * @param {Array<object>} notes   already sorted, newest first
 * @param {object}  opts
 * @param {'updatedAt'|'createdAt'} [opts.field='updatedAt']
 * @param {Date}    [opts.now=new Date()]
 * @returns {Array<{ key: string, label: string, notes: object[] }>}
 */
export function groupByRecency(notes, { field = 'updatedAt', now = new Date() } = {}) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 6);

  const groups = [];
  const byKey = new Map();

  for (const note of notes || []) {
    const when = toDate(note?.[field]) || toDate(note?.updatedAt) || toDate(note?.createdAt);
    let key;
    let label;
    if (!when) {
      key = 'earlier';
      label = 'Earlier';
    } else if (when >= startOfToday) {
      key = 'today';
      label = 'Today';
    } else if (when >= startOfYesterday) {
      key = 'yesterday';
      label = 'Yesterday';
    } else if (when >= startOfWeek) {
      key = 'week';
      label = 'This week';
    } else {
      key = `m-${when.getFullYear()}-${when.getMonth()}`;
      const month = when.toLocaleDateString(undefined, { month: 'long' });
      label = when.getFullYear() === now.getFullYear() ? month : `${month} ${when.getFullYear()}`;
    }

    let group = byKey.get(key);
    if (!group) {
      group = { key, label, notes: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.notes.push(note);
  }
  return groups;
}
