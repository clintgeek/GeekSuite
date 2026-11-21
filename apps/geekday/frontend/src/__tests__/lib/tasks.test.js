// Runs in America/Chicago (vitest.config.js): calendar days must survive a real offset.
import { describe, expect, it } from 'vitest';
import { clockLabel, dueDayKey, dueFieldsOn, groupDayTasks, hasDueTime, nextTask, openCount } from '../../lib/tasks.js';
import { addDays, anchorFor, isDayKey, keyToDate, noteTagsFor, noteTitleFor, relativeName, todayKey, tzOffsetFor } from '../../lib/days.js';

const TODAY = '2026-11-20';
const dateOnly = (key) => `${key}T00:00:00.000Z`;
const task = (over) => ({ id: over.id || over.content, content: 'x', status: 'pending', ...over });

describe('days', () => {
  it('adds days across a month end and a DST change', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02'); // the day US clocks fall back
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09'); // the day they spring forward
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('rejects keys that are not real days', () => {
    expect(isDayKey('2026-11-20')).toBe(true);
    expect(isDayKey('2026-02-31')).toBe(false);
    expect(isDayKey('today')).toBe(false);
    expect(keyToDate('2026-13-01')).toBeNull();
  });

  it('sends the offset in force on the requested day, not today', () => {
    expect(tzOffsetFor('2026-07-04')).toBe(300); // CDT
    expect(tzOffsetFor('2026-12-25')).toBe(360); // CST
  });

  it('anchors typed text to the day on screen at the current clock time', () => {
    const anchor = anchorFor('2026-11-25', new Date(2026, 10, 20, 14, 30));
    expect(todayKey(anchor)).toBe('2026-11-25');
    expect(anchor.getHours()).toBe(14);
  });

  it('names the note for a day', () => {
    expect(noteTitleFor('2026-11-20')).toBe('2026-11-20 Friday');
    expect(noteTagsFor('2026-11-20')).toEqual(['daily', 'daily/2026-11-20']);
  });

  it('knows today, tomorrow and yesterday', () => {
    const now = new Date(2026, 10, 20, 9);
    expect(relativeName('2026-11-20', now)).toBe('Today');
    expect(relativeName('2026-11-21', now)).toBe('Tomorrow');
    expect(relativeName('2026-11-19', now)).toBe('Yesterday');
    expect(relativeName('2026-11-25', now)).toBe('');
  });
});

describe('a due date is a calendar day or an instant', () => {
  it('reads a date-only task in UTC and a timed one locally', () => {
    // 8pm Central on the 20th is 02:00Z on the 21st: still the 20th to the user.
    const evening = task({ dueDate: '2026-11-21T02:00:00.000Z', hasDueTime: true });
    expect(dueDayKey(evening)).toBe('2026-11-20');
    expect(dueDayKey(task({ dueDate: dateOnly('2026-11-20'), hasDueTime: false }))).toBe('2026-11-20');
  });

  it('falls back to "not exactly UTC midnight" for rows older than the flag', () => {
    expect(hasDueTime(task({ dueDate: dateOnly('2026-11-20') }))).toBe(false);
    expect(hasDueTime(task({ dueDate: '2026-11-20T15:00:00.000Z' }))).toBe(true);
    expect(hasDueTime(task({ dueDate: null }))).toBe(false);
  });

  it('lets the flag win over the value: 6pm Central is exactly UTC midnight', () => {
    expect(hasDueTime(task({ dueDate: dateOnly('2026-11-21'), hasDueTime: true }))).toBe(true);
  });
});

describe('groupDayTasks', () => {
  const list = [
    task({ content: 'late bill', dueDate: dateOnly('2026-11-18'), hasDueTime: false }),
    task({ content: 'vet 2pm', dueDate: '2026-11-20T20:00:00.000Z', hasDueTime: true }),
    task({ content: 'standup 9am', dueDate: '2026-11-20T15:00:00.000Z', hasDueTime: true }),
    task({ content: 'buy feed', dueDate: dateOnly('2026-11-20'), hasDueTime: false, priority: 2 }),
    task({ content: 'urgent', dueDate: dateOnly('2026-11-20'), hasDueTime: false, priority: 1 }),
    task({ content: 'someday', dueDate: null }),
    task({ content: 'done today', dueDate: dateOnly('2026-11-20'), hasDueTime: false, status: 'completed' }),
    task({ content: 'tomorrow', dueDate: dateOnly('2026-11-21'), hasDueTime: false }),
    task({ content: 'series master', dueDate: dateOnly('2026-11-20'), isSeriesMaster: true }),
  ];
  const names = (rows) => rows.map((t) => t.content);

  it('groups today as overdue, timed, untimed and done', () => {
    const g = groupDayTasks(list, TODAY, TODAY);
    expect(names(g.overdue)).toEqual(['late bill']);
    expect(names(g.timed)).toEqual(['standup 9am', 'vet 2pm']);
    expect(names(g.untimed)).toEqual(['urgent', 'buy feed', 'someday']);
    expect(names(g.done)).toEqual(['done today']);
    expect(openCount(g)).toBe(6);
  });

  it('shows overdue and undated tasks on today only', () => {
    // The gateway answers "everything due before the day" for any day asked.
    const g = groupDayTasks(list, '2026-11-21', TODAY);
    expect(g.overdue).toEqual([]);
    expect(names(g.untimed)).toEqual(['tomorrow']);
    expect(g.timed).toEqual([]);
  });

  it('never shows a series master row', () => {
    const g = groupDayTasks(list, TODAY, TODAY);
    expect(names([...g.overdue, ...g.timed, ...g.untimed, ...g.done])).not.toContain('series master');
  });

  it('collapses a repeating task’s missed days to the latest one', () => {
    const missed = [
      task({ id: 'a', content: 'water', seriesId: 's1', dueDate: dateOnly('2026-11-17'), hasDueTime: false }),
      task({ id: 'b', content: 'water', seriesId: 's1', dueDate: dateOnly('2026-11-19'), hasDueTime: false }),
    ];
    expect(groupDayTasks(missed, TODAY, TODAY).overdue.map((t) => t.id)).toEqual(['b']);
  });

  it('puts an undated finished task on the day it was finished', () => {
    const finished = [task({ content: 'quick thing', dueDate: null, status: 'completed', completedAt: '2026-11-20T16:00:00.000Z' })];
    expect(names(groupDayTasks(finished, TODAY, TODAY).done)).toEqual(['quick thing']);
    expect(groupDayTasks(finished, '2026-11-19', TODAY).done).toEqual([]);
  });

  it('tolerates an empty or missing list', () => {
    expect(openCount(groupDayTasks(undefined, TODAY, TODAY))).toBe(0);
  });
});

describe('dueFieldsOn (move to another day)', () => {
  it('keeps a date-only task date-only', () => {
    expect(dueFieldsOn(task({ dueDate: dateOnly('2026-11-18'), hasDueTime: false }), '2026-11-21')).toEqual({
      dueDate: '2026-11-21',
      hasDueTime: false,
    });
  });

  it('keeps a timed task’s local clock time on the new day', () => {
    const moved = dueFieldsOn(task({ dueDate: '2026-11-20T20:00:00.000Z', hasDueTime: true }), '2026-11-21');
    expect(moved.hasDueTime).toBe(true);
    expect(new Date(moved.dueDate).getHours()).toBe(14);
    expect(dueDayKey(moved)).toBe('2026-11-21');
  });

  it('never leaves a timed task exactly on UTC midnight', () => {
    // 6pm Central = 00:00Z, which older code reads as "no time".
    const moved = dueFieldsOn(task({ dueDate: '2026-11-21T00:00:01.000Z', hasDueTime: true }), '2026-11-22');
    expect(moved.dueDate).toBe('2026-11-23T00:00:01.000Z');
  });

  it('gives an undated task the target day', () => {
    expect(dueFieldsOn(task({ dueDate: null }), '2026-11-21')).toEqual({ dueDate: '2026-11-21', hasDueTime: false });
  });
});

describe('nextTask (the docked view)', () => {
  const now = new Date('2026-11-20T18:00:00.000Z'); // noon Central
  const groupsOf = (rows) => groupDayTasks(rows, TODAY, TODAY);

  it('prefers the next timed task still ahead', () => {
    const next = nextTask(
      groupsOf([
        task({ content: 'standup 9am', dueDate: '2026-11-20T15:00:00.000Z', hasDueTime: true }),
        task({ content: 'vet 2pm', dueDate: '2026-11-20T20:00:00.000Z', hasDueTime: true }),
        task({ content: 'buy feed', dueDate: dateOnly(TODAY), hasDueTime: false }),
      ]),
      now
    );
    expect(next.task.content).toBe('vet 2pm');
    expect(next.kind).toBe('timed');
    expect(clockLabel(next.task, 'en-US')).toBe('2:00 PM');
  });

  it('falls back to a late timed task, then overdue, then untimed', () => {
    expect(nextTask(groupsOf([task({ content: 'standup', dueDate: '2026-11-20T15:00:00.000Z', hasDueTime: true })]), now).kind).toBe('late');
    expect(nextTask(groupsOf([task({ content: 'bill', dueDate: dateOnly('2026-11-18'), hasDueTime: false })]), now).kind).toBe('overdue');
    expect(nextTask(groupsOf([task({ content: 'feed', dueDate: dateOnly(TODAY), hasDueTime: false })]), now).kind).toBe('untimed');
  });

  it('is null when the day is clear', () => {
    expect(nextTask(groupsOf([task({ content: 'done', dueDate: dateOnly(TODAY), status: 'completed' })]), now)).toBeNull();
  });
});
