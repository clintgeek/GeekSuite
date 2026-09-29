/**
 * What Today, Upcoming, Done and Search show — pure slices of one corpus.
 * A fixed `now`, never the wall clock; run in Chicago so a date-only value
 * read in local time would land a day early and fail.
 */
import { describe, it, expect } from 'vitest';
import {
  todaySections, upcomingGroups, doneGroups, searchTasks, filterByTag, whenLabel, tagCounts,
} from '../../utils/penViews';

process.env.TZ = 'America/Chicago';

const now = new Date(2026, 8, 29, 10, 0); // Tue 29 Sep 2026
const on = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T00:00:00.000Z`;
const at = (m, d, h, min = 0) => new Date(2026, m - 1, d, h, min).toISOString();
let seq = 0;
const t = (over) => ({ id: `t${++seq}`, content: `task ${seq}`, status: 'pending', createdAt: at(9, 1, 8), ...over });
const ids = (list) => list.map((x) => x.content);

describe('todaySections', () => {
  const tasks = [
    t({ content: 'late 4', dueDate: on(2026, 9, 25) }),
    t({ content: 'late 1', dueDate: on(2026, 9, 28) }),
    t({ content: 'parked', dueDate: on(2026, 9, 27), status: 'blocked' }),
    t({ content: 'plain', dueDate: on(2026, 9, 29) }),
    t({ content: 'high', dueDate: on(2026, 9, 29), priority: 1 }),
    t({ content: 'nine', dueDate: at(9, 29, 9) }),
    t({ content: 'eight', dueDate: at(9, 29, 8) }),
    t({ content: 'evening', dueDate: at(9, 29, 21) }),
    t({ content: 'anytime', dueDate: null }),
    t({ content: 'tomorrow', dueDate: on(2026, 9, 30) }),
    t({ content: 'done today', dueDate: on(2026, 9, 29), status: 'completed', completedAt: at(9, 29, 9) }),
    t({ content: 'done before', dueDate: on(2026, 9, 20), status: 'completed', completedAt: at(9, 20, 9) }),
  ];
  const s = todaySections(tasks, now);

  it('carries over everything open before today, blocked included, oldest first', () => {
    expect(ids(s.overdue)).toEqual(['late 4', 'parked', 'late 1']);
  });

  it('sorts today by priority, then time, untimed after timed', () => {
    expect(ids(s.today)).toEqual(['high', 'eight', 'nine', 'evening', 'plain']);
  });

  it('keeps an evening task on its local day (not the UTC one)', () => {
    expect(ids(s.today)).toContain('evening');
  });

  it('puts undated open tasks in Anytime', () => {
    expect(ids(s.anytime)).toEqual(['anytime']);
  });

  it('counts "to do" and "done today"', () => {
    expect(s.counts).toEqual({ toDo: 3 + 5 + 1, done: 1 });
  });

  it('carries only the latest missed occurrence of a repeat', () => {
    const r = todaySections([
      t({ id: 'virtual_m_1', seriesId: 'm', content: 'meds', dueDate: at(9, 26, 21) }),
      t({ id: 'virtual_m_2', seriesId: 'm', content: 'meds', dueDate: at(9, 28, 21) }),
      t({ id: 'virtual_m_3', seriesId: 'm', content: 'meds', dueDate: at(9, 29, 21) }),
    ], now);
    expect(r.overdue.map((x) => x.id)).toEqual(['virtual_m_2']);
    expect(r.today.map((x) => x.id)).toEqual(['virtual_m_3']);
  });
});

describe('upcomingGroups', () => {
  const tasks = [
    t({ content: 'wed', dueDate: on(2026, 9, 30) }),
    t({ content: 'fri b', dueDate: on(2026, 10, 2), priority: 1 }),
    t({ content: 'fri a', dueDate: on(2026, 10, 2) }),
    t({ content: 'day 14', dueDate: on(2026, 10, 13) }),
    t({ content: 'day 15', dueDate: on(2026, 10, 14) }),
    t({ content: 'nov', dueDate: on(2026, 11, 3) }),
    t({ content: 'done fri', dueDate: on(2026, 10, 2), status: 'completed', completedAt: at(9, 28, 9) }),
    t({ content: 'today', dueDate: on(2026, 9, 29) }),
  ];
  const g = upcomingGroups(tasks, now);

  it('shows only the days that have something, in order', () => {
    expect(g.days.map((d) => d.key)).toEqual(['2026-09-30', '2026-10-02', '2026-10-13']);
  });

  it('orders a day by priority', () => {
    expect(ids(g.days[1].tasks)).toEqual(['fri b', 'fri a']);
  });

  it('puts what is past the fortnight in Later, by month', () => {
    expect(g.later.map((m) => [m.key, ids(m.tasks)])).toEqual([['2026-10', ['day 15']], ['2026-11', ['nov']]]);
  });

  it('shows a repeat once in Later, at its next occurrence', () => {
    const r = upcomingGroups([
      t({ id: 'virtual_s_1', seriesId: 's', content: 'rent', dueDate: on(2026, 11, 1) }),
      t({ id: 'virtual_s_2', seriesId: 's', content: 'rent', dueDate: on(2026, 12, 1) }),
    ], now);
    expect(r.later.flatMap((m) => m.tasks).map((x) => x.id)).toEqual(['virtual_s_1']);
  });
});

describe('doneGroups', () => {
  const tasks = [
    t({ content: 'a', status: 'completed', completedAt: at(9, 29, 8) }),
    t({ content: 'b', status: 'completed', completedAt: at(9, 29, 11) }),
    t({ content: 'c', status: 'completed', completedAt: at(9, 27, 23, 30) }),
    t({ content: 'x', status: 'cancelled', cancelledAt: at(9, 26, 12) }),
    t({ content: 'open', dueDate: null }),
  ];

  it('groups by local day, newest day and newest task first', () => {
    const g = doneGroups(tasks);
    expect(g.map((d) => [d.key, ids(d.tasks)])).toEqual([
      ['2026-09-29', ['b', 'a']],
      ['2026-09-27', ['c']],
      ['2026-09-26', ['x']],
    ]);
  });

  it('searches the words', () => {
    expect(doneGroups(tasks, 'b').flatMap((d) => ids(d.tasks))).toEqual(['b']);
  });
});

describe('searchTasks', () => {
  const tasks = [
    t({ content: 'Call Dana', dueDate: on(2026, 10, 1), tags: ['work'] }),
    t({ content: 'Email', note: 'ask Dana about it', dueDate: null }),
    t({ content: 'Dana lunch', status: 'completed', completedAt: at(9, 20, 12) }),
    t({ content: 'Other' }),
  ];
  it('finds words, notes and #tags; open first', () => {
    const r = searchTasks(tasks, 'dana');
    expect(ids(r.open)).toEqual(['Call Dana', 'Email']);
    expect(ids(r.done)).toEqual(['Dana lunch']);
    expect(ids(searchTasks(tasks, '#work').open)).toEqual(['Call Dana']);
  });
});

describe('filterByTag / tagCounts', () => {
  const tasks = [t({ tags: ['Work'] }), t({ tags: ['home'] }), t({ tags: ['work', 'fd'] })];
  it('filters case-insensitively; no tag means everything', () => {
    expect(filterByTag(tasks, 'work')).toHaveLength(2);
    expect(filterByTag(tasks, null)).toHaveLength(3);
  });
  it('counts tags, most used first', () => {
    expect(tagCounts([t({ tags: ['a', 'b'] }), t({ tags: ['b'] })])).toEqual(['b', 'a']);
  });
});

describe('whenLabel', () => {
  it('says how late, in words', () => {
    expect(whenLabel(t({ dueDate: on(2026, 9, 27) }), now)).toEqual({ text: '2 days late', late: true });
    expect(whenLabel(t({ dueDate: on(2026, 9, 28) }), now)).toEqual({ text: '1 day late', late: true });
  });
  it('says the time today, "tomorrow", a weekday, then a date', () => {
    expect(whenLabel(t({ dueDate: at(9, 29, 14, 30) }), now).text).toBe('2:30pm');
    expect(whenLabel(t({ dueDate: on(2026, 9, 29) }), now).text).toBe('');
    expect(whenLabel(t({ dueDate: on(2026, 9, 30) }), now).text).toBe('tomorrow');
    expect(whenLabel(t({ dueDate: at(9, 30, 9) }), now).text).toBe('tomorrow 9am');
    expect(whenLabel(t({ dueDate: on(2026, 10, 2) }), now).text).toBe('Fri');
    expect(whenLabel(t({ dueDate: on(2026, 10, 14) }), now).text).toBe('Wed 14 Oct');
    expect(whenLabel(t({ dueDate: on(2026, 9, 29) }), now, 'any').text).toBe('today');
    expect(whenLabel(t({ dueDate: at(9, 29, 14) }), now, 'any').text).toBe('today 2pm');
    expect(whenLabel(t({ dueDate: at(10, 1, 14) }), now, 'day').text).toBe('2pm');
  });
});
