/**
 * Contract C2 on the client (plan 1.1, 2026-11-15): a task's `hasDueTime`
 * flag decides whether its due date carries a time. 6 pm US-Central (CST) is
 * EXACTLY UTC midnight, which the old rule read as "date only, next day".
 * Run under any TZ: the cases are built from UTC instants.
 */
import { describe, it, expect } from 'vitest';
import { localDateString } from '@geeksuite/utils';
import { hasDueTime, dueDayKey, dueFields, withExplicitTime, avoidUtcMidnight } from '../../utils/dueDate';
import { todaySections, whenLabel, searchTasks, clockLabel } from '../../utils/penViews';

const MIDNIGHT = '2026-11-21T00:00:00.000Z';

describe('hasDueTime / dueDayKey honour the flag', () => {
  it('a task flagged timed at UTC midnight is timed, on its LOCAL day', () => {
    const task = { dueDate: MIDNIGHT, hasDueTime: true };
    expect(hasDueTime(task)).toBe(true);
    expect(dueDayKey(task)).toBe(localDateString(new Date(MIDNIGHT)));
  });

  it('without a flag the legacy rule still applies', () => {
    expect(hasDueTime({ dueDate: MIDNIGHT })).toBe(false);
    expect(hasDueTime(MIDNIGHT)).toBe(false);
    expect(dueDayKey({ dueDate: MIDNIGHT })).toBe('2026-11-21');
    expect(hasDueTime({ dueDate: '2026-11-21T15:00:00.000Z' })).toBe(true);
  });

  it('a flag of false wins over a non-midnight value', () => {
    expect(hasDueTime({ dueDate: '2026-11-21T15:00:00.000Z', hasDueTime: false })).toBe(false);
  });

  it('no due date is never timed', () => {
    expect(hasDueTime({ dueDate: null, hasDueTime: true })).toBe(false);
  });
});

describe('writes say what they mean', () => {
  it('dueFields: a calendar day is date-only, an instant is timed and off midnight', () => {
    expect(dueFields('2026-11-21')).toEqual({ dueDate: '2026-11-21', hasDueTime: false });
    expect(dueFields(null)).toEqual({ dueDate: null, hasDueTime: false });
    const timed = dueFields(MIDNIGHT);
    expect(timed.hasDueTime).toBe(true);
    expect(timed.dueDate).toBe('2026-11-21T00:00:01.000Z');
  });

  it('avoidUtcMidnight leaves any other instant alone', () => {
    const d = new Date('2026-11-21T15:00:00.000Z');
    expect(avoidUtcMidnight(d).getTime()).toBe(d.getTime());
  });

  it('withExplicitTime moves a flagged-timed midnight off midnight, and nothing else', () => {
    expect(withExplicitTime({ id: 'a', dueDate: MIDNIGHT, hasDueTime: true }).dueDate).toBe('2026-11-21T00:00:01.000Z');
    const dateOnly = { id: 'b', dueDate: MIDNIGHT, hasDueTime: false };
    expect(withExplicitTime(dateOnly)).toBe(dateOnly);
  });
});

describe('the views use the flag', () => {
  it('a 6 pm task for "today" is in Today, with its time — not tomorrow', () => {
    const due = new Date(MIDNIGHT);
    const now = new Date(due.getTime() - 2 * 3600000); // two hours before it
    const task = { id: 't', content: 'pick up kids', status: 'pending', dueDate: MIDNIGHT, hasDueTime: true };
    const s = todaySections([task], now);
    expect(clockLabel(task)).not.toBe('');
    // West of UTC (where 6 pm can be UTC midnight) both instants share a
    // local day; that is the case under test. The suite's TZ decides.
    if (localDateString(due) === localDateString(now)) {
      expect(s.today.map((t) => t.id)).toEqual(['t']);
      expect(whenLabel(task, now).text).not.toMatch(/tomorrow/);
    }
  });
});

describe('Search shows a repeat once, at its most recent missed occurrence (D3)', () => {
  const now = new Date(2026, 10, 15, 12);
  const occ = (id, day) => ({ id: `virtual_m1_${id}`, seriesId: 'm1', content: 'vitamins', status: 'pending', dueDate: `${day}T15:00:00.000Z` });

  it('picks the latest past one, not the oldest', () => {
    const rows = [occ(1, '2026-11-10'), occ(2, '2026-11-13'), occ(3, '2026-11-14'), occ(4, '2026-11-17')];
    const { open } = searchTasks(rows, 'vitamins', now);
    expect(open.map((t) => t.id)).toEqual(['virtual_m1_3']);
  });

  it('with nothing missed, the next one', () => {
    const rows = [occ(4, '2026-11-18'), occ(5, '2026-11-17')];
    const { open } = searchTasks(rows, 'vitamins', now);
    expect(open.map((t) => t.id)).toEqual(['virtual_m1_5']);
  });
});
