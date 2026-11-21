// Runs in America/Chicago (vitest.config.js): weeks are local calendar weeks.
import { describe, expect, it } from 'vitest';
import { addWeeks, relativeWeekName, weekKeys, weekRangeLabel, weekStart } from '../../lib/days.js';
import { weekOffsets } from '../../hooks/useWeekTasks.js';
import { fitRows, groupWeek, mergeTaskLists, nextWeekTarget } from '../../lib/week.js';
import { dateOnly, makeTask } from '../helpers.jsx';

const TODAY = '2026-11-20'; // a Friday
const KEYS = weekKeys(TODAY);
const NOW = new Date(2026, 10, 20, 9, 0, 0);

describe('weeks in lib/days.js', () => {
  it('a week starts on Monday, whichever of its days is asked about', () => {
    expect(weekStart('2026-11-16')).toBe('2026-11-16'); // Monday is its own start
    expect(weekStart('2026-11-20')).toBe('2026-11-16');
    expect(weekStart('2026-11-22')).toBe('2026-11-16'); // Sunday closes the week, it does not open the next
    expect(weekStart('2026-11-23')).toBe('2026-11-23');
  });

  it('gives the seven days, Monday to Sunday', () => {
    expect(KEYS).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
  });

  it('a week with a DST change still has seven distinct days', () => {
    // Clocks go back on Sunday 2026-11-01 (a 25-hour day) and forward on Sunday 2026-03-08 (23 hours).
    expect(weekKeys('2026-11-01')).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
    expect(weekKeys('2026-03-08')).toEqual(['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08']);
    expect(weekStart('2026-11-02')).toBe('2026-11-02');
    expect(addWeeks('2026-10-26', 1)).toBe('2026-11-02');
    expect(addWeeks('2026-03-09', -1)).toBe('2026-03-02');
  });

  it('a week across the year boundary', () => {
    expect(weekKeys('2026-12-31')).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
    expect(weekStart('2027-01-03')).toBe('2026-12-28');
    expect(addWeeks('2026-12-28', 1)).toBe('2027-01-04');
  });

  it('heads a week with its span, and the years only when they are not this one', () => {
    expect(weekRangeLabel('2026-11-20', NOW, 'en-US')).toBe('Nov 16 – 22');
    expect(weekRangeLabel('2026-12-02', NOW, 'en-US')).toBe('Nov 30 – Dec 6');
    expect(weekRangeLabel('2026-12-31', NOW, 'en-US')).toBe('Dec 28, 2026 – Jan 3, 2027');
    expect(weekRangeLabel('2025-11-20', NOW, 'en-US')).toBe('Nov 17 – 23, 2025');
  });

  it('names this week, next week and last week, and no other', () => {
    expect(relativeWeekName('2026-11-22', NOW)).toBe('This week');
    expect(relativeWeekName('2026-11-23', NOW)).toBe('Next week');
    expect(relativeWeekName('2026-11-15', NOW)).toBe('Last week');
    expect(relativeWeekName('2026-12-01', NOW)).toBe('');
  });

  it('reads a week once per UTC offset in force during it: twice when the clocks change', () => {
    expect(weekOffsets('2026-11-16')).toEqual([360]);
    expect(weekOffsets('2026-10-26')).toEqual([300, 360]); // CDT until Sunday morning, then CST
    expect(weekOffsets('2026-03-02')).toEqual([360, 300]);
  });
});

describe('mergeTaskLists', () => {
  it('keeps one row per id across the answers, skipping missing lists', () => {
    const a = makeTask({ id: 'a', content: 'from the week' });
    const merged = mergeTaskLists([a, makeTask({ id: 'b' })], undefined, [makeTask({ id: 'a', content: 'from today' }), makeTask({ id: 'c' })]);
    expect(merged.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(merged[0]).toBe(a);
  });
});

describe('groupWeek (W1, W3)', () => {
  const LIST = [
    makeTask({ content: 'untimed thu', dueDate: dateOnly('2026-11-19') }),
    makeTask({ content: 'timed thu 2pm', dueDate: '2026-11-19T20:00:00.000Z', hasDueTime: true }),
    makeTask({ content: 'timed thu 9am', dueDate: '2026-11-19T15:00:00.000Z', hasDueTime: true }),
    makeTask({ content: 'done thu', dueDate: dateOnly('2026-11-19'), status: 'completed', completedAt: '2026-11-19T18:00:00.000Z' }),
    // 8pm Central on Sunday is Monday 02:00Z: it belongs to Sunday, the last day of this week.
    makeTask({ content: 'sunday evening', dueDate: '2026-11-23T02:00:00.000Z', hasDueTime: true }),
    makeTask({ content: 'today', dueDate: dateOnly(TODAY) }),
    makeTask({ content: 'old', dueDate: dateOnly('2026-11-10') }),
    makeTask({ content: 'someday' }),
    makeTask({ content: 'next week', dueDate: dateOnly('2026-11-24') }),
    makeTask({ content: 'done undated', status: 'completed', completedAt: '2026-11-18T18:00:00.000Z' }),
    makeTask({ content: 'master', dueDate: dateOnly('2026-11-19'), isSeriesMaster: true }),
  ];
  const names = (list) => list.map((t) => t.content);

  it('puts each task on the day it is due: timed in time order, then untimed, then done', () => {
    const { days } = groupWeek(LIST, KEYS, TODAY);
    const thu = days['2026-11-19'];
    expect(names(thu.timed)).toEqual(['timed thu 9am', 'timed thu 2pm']);
    expect(names(thu.untimed)).toEqual(['untimed thu']);
    expect(names(thu.done)).toEqual(['done thu']);
    expect(thu.open).toBe(3);
    expect(names(days['2026-11-22'].timed)).toEqual(['sunday evening']);
    expect(names(days['2026-11-18'].done)).toEqual(['done undated']);
    expect(days['2026-11-16']).toEqual({ timed: [], untimed: [], done: [], open: 0 });
  });

  it('the eighth cell holds what is overdue from before the week and what has no date', () => {
    const { unscheduled } = groupWeek(LIST, KEYS, TODAY);
    expect(names(unscheduled.overdue)).toEqual(['old']);
    expect(names(unscheduled.undated)).toEqual(['someday']);
    expect(unscheduled.open).toBe(2);
  });

  it('undated tasks are not also counted on today, and a task of this week is not also listed as unscheduled', () => {
    const { days, unscheduled } = groupWeek(LIST, KEYS, TODAY);
    expect(names(days[TODAY].untimed)).toEqual(['today']);
    expect(days[TODAY].open).toBe(1);
    // "untimed thu" is unfinished and Thursday has passed: it stays in Thursday's cell only.
    expect(names(unscheduled.overdue)).not.toContain('untimed thu');
  });

  it('on another week, this week’s unfinished past days are overdue; tasks still ahead are not', () => {
    const next = weekKeys('2026-11-24');
    const { days, unscheduled } = groupWeek(LIST, next, TODAY);
    expect(names(days['2026-11-24'].untimed)).toEqual(['next week']);
    expect(names(unscheduled.overdue)).toEqual(['old', 'untimed thu', 'timed thu 9am', 'timed thu 2pm']);
    expect(names(unscheduled.overdue)).not.toContain('today');
    expect(names(unscheduled.overdue)).not.toContain('sunday evening');
  });

  it('a repeating task’s missed occurrences are one overdue row, the latest', () => {
    const missed = ['2026-11-09', '2026-11-11', '2026-11-13'].map((key) =>
      makeTask({ id: `virtual_s_${key}`, content: 'water', dueDate: dateOnly(key), seriesId: 's', recurrenceRule: 'FREQ=DAILY' })
    );
    const { unscheduled } = groupWeek(missed, KEYS, TODAY);
    expect(unscheduled.overdue.map((t) => t.id)).toEqual(['virtual_s_2026-11-13']);
  });
});

describe('fitRows: a cell that does not scroll', () => {
  const rows = (n, prefix) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

  it('shows everything when it fits, or when the cell may grow', () => {
    expect(fitRows(rows(3, 'o'), rows(2, 'd'), 5)).toEqual({ open: rows(3, 'o'), done: rows(2, 'd'), doneCollapsed: 0, more: 0 });
    expect(fitRows(rows(9, 'o'), rows(4, 'd'), Infinity).more).toBe(0);
  });

  it('folds the done rows into one line before hiding anything still to do', () => {
    expect(fitRows(rows(3, 'o'), rows(3, 'd'), 5)).toEqual({ open: rows(3, 'o'), done: [], doneCollapsed: 3, more: 0 });
  });

  it('ends with "+N more" when the open rows do not fit, keeping a row for that line', () => {
    expect(fitRows(rows(7, 'o'), [], 5)).toEqual({ open: rows(4, 'o'), done: [], doneCollapsed: 0, more: 3 });
    expect(fitRows(rows(5, 'o'), rows(1, 'd'), 5)).toEqual({ open: rows(4, 'o'), done: [], doneCollapsed: 1, more: 1 });
  });

  it('never shows more lines than fit', () => {
    for (let open = 0; open <= 8; open += 1) {
      for (let done = 0; done <= 4; done += 1) {
        for (let capacity = 1; capacity <= 8; capacity += 1) {
          const shown = fitRows(rows(open, 'o'), rows(done, 'd'), capacity);
          const lines = shown.open.length + shown.done.length + (shown.more || shown.doneCollapsed ? 1 : 0);
          expect(lines).toBeLessThanOrEqual(Math.max(capacity, 1));
          // Nothing is lost: every open task is either shown or counted.
          expect(shown.open.length + shown.more).toBe(open);
          expect(shown.done.length + shown.doneCollapsed).toBe(done);
        }
      }
    }
  });
});

describe('nextWeekTarget', () => {
  it('keeps the weekday for a task in the week, and sends an unscheduled one to next Monday', () => {
    expect(nextWeekTarget(makeTask({ content: 'thu', dueDate: dateOnly('2026-11-19') }), KEYS)).toBe('2026-11-26');
    expect(nextWeekTarget(makeTask({ content: 'someday' }), KEYS)).toBe('2026-11-23');
    expect(nextWeekTarget(makeTask({ content: 'old', dueDate: dateOnly('2026-11-10') }), KEYS)).toBe('2026-11-23');
  });
});
