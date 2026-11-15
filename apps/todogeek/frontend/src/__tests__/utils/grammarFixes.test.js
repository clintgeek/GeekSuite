/**
 * Three ways a typed line became the wrong task (plan 1.16, 2026-11-15).
 * The grammar is shared with NoteGeek's handwritten journal lines
 * (`@geeksuite/task-grammar`), so these hold there too.
 */
import { describe, it, expect } from 'vitest';
import parseTaskInput from '../../utils/parseTaskInput';
import { toCreateInput } from '../../utils/quickAdd';

const NOW = new Date(2026, 10, 15, 10, 0, 0); // Sun 15 Nov 2026, 10:00 local

describe('a number after a slash date is a time only when it says so', () => {
  it('buy /tomorrow 2 loaves is two loaves tomorrow, not 2 am', () => {
    const r = parseTaskInput('buy /tomorrow 2 loaves', { now: NOW });
    expect(r.content).toBe('buy 2 loaves');
    expect(r.hasTime).toBeUndefined();
    expect(r.dueDate.getDate()).toBe(16);
  });

  it.each([
    ['call /tomorrow 2pm', 14, 0],
    ['call /tomorrow 2 p.m.', 14, 0],
    ['call /tomorrow 2:30', 2, 30],
    ['call /tomorrow 14:30', 14, 30],
    ['call /friday 9am', 9, 0],
  ])('%s keeps its time', (line, h, m) => {
    const r = parseTaskInput(line, { now: NOW });
    expect(r.content).toBe('call');
    expect(r.hasTime).toBe(true);
    expect([r.dueDate.getHours(), r.dueDate.getMinutes()]).toEqual([h, m]);
  });

  it('a time out of range is not a time', () => {
    const r = parseTaskInput('call /tomorrow 14pm', { now: NOW });
    expect(r.hasTime).toBeUndefined();
    expect(r.content).toBe('call 14pm');
  });
});

describe('a date with no year is the next one', () => {
  it('/mar 5 in November is next March', () => {
    const r = parseTaskInput('renew /mar 5', { now: NOW });
    expect([r.dueDate.getFullYear(), r.dueDate.getMonth(), r.dueDate.getDate()]).toEqual([2027, 2, 5]);
  });

  it('/03-05 in November is next March', () => {
    const r = parseTaskInput('renew /03-05', { now: NOW });
    expect(r.dueDate.getFullYear()).toBe(2027);
  });

  it('/nov 15 typed on the 15th is today', () => {
    const r = parseTaskInput('renew /nov 15', { now: NOW });
    expect([r.dueDate.getFullYear(), r.dueDate.getMonth(), r.dueDate.getDate()]).toEqual([2026, 10, 15]);
  });

  it('/10th after the 10th is next month', () => {
    const r = parseTaskInput('rent /10th', { now: NOW });
    expect([r.dueDate.getMonth(), r.dueDate.getDate()]).toEqual([11, 10]);
  });

  it('a typed year is kept, even in the past', () => {
    const r = parseTaskInput('taxes /2026-03-15', { now: NOW });
    expect(r.dueDate.getFullYear()).toBe(2026);
  });
});

describe('only a slash that starts a word is a date', () => {
  it('a URL keeps its path and is not a due date', () => {
    const r = parseTaskInput('read example.com/2024 notes', { now: NOW });
    expect(r.dueDate).toBeUndefined();
    expect(r.content).toBe('read example.com/2024 notes');
  });

  it('a slash inside a word is not a date, even a date word', () => {
    const r = parseTaskInput('read example.com/today notes', { now: NOW });
    expect(r.dueDate).toBeUndefined();
    expect(r.content).toBe('read example.com/today notes');
  });

  it('/2024 on its own is not the 20th', () => {
    const r = parseTaskInput('archive /2024', { now: NOW });
    expect(r.dueDate).toBeUndefined();
  });

  it('a day the month does not have is not a date', () => {
    const r = parseTaskInput('pay /02-30', { now: NOW });
    expect(r.dueDate).toBeUndefined();
    expect(r.content).toBe('pay /02-30');
  });
});

describe('toCreateInput says whether the date is timed (contract C2, explicit)', () => {
  it('a typed time sends hasDueTime: true', () => {
    const { input } = toCreateInput(parseTaskInput('call /tomorrow 2pm', { now: NOW }), { today: NOW, explicit: true });
    expect(input.hasDueTime).toBe(true);
  });

  it('a date without a time sends hasDueTime: false', () => {
    const { input } = toCreateInput(parseTaskInput('call /tomorrow', { now: NOW }), { today: NOW, explicit: true });
    expect(input).toMatchObject({ dueDate: '2026-11-16', hasDueTime: false });
  });

  it('no date is today, date-only', () => {
    const { input } = toCreateInput(parseTaskInput('call', { now: NOW }), { today: NOW, explicit: true });
    expect(input).toMatchObject({ hasDueTime: false });
  });

  it('a timed value is never exactly UTC midnight', () => {
    // Whatever zone the test runs in, build the local time that IS UTC midnight.
    const midnight = new Date(Date.UTC(2026, 10, 21, 0, 0, 0));
    const parsed = { content: 'pick up kids', signifier: '*', dueDate: midnight, hasTime: true };
    const { input } = toCreateInput(parsed, { today: NOW, explicit: true });
    const sent = new Date(input.dueDate);
    expect(sent.getTime()).not.toBe(midnight.getTime());
    expect(Math.abs(sent.getTime() - midnight.getTime())).toBeLessThan(60000);
    expect(input.hasDueTime).toBe(true);
  });

  it('a repeat carries the browser time zone', () => {
    const { input } = toCreateInput(parseTaskInput('(daily) vitamins', { now: NOW }), { today: NOW, explicit: true, timeZone: 'America/Chicago' });
    expect(input.timeZone).toBe('America/Chicago');
    expect(input.recurrenceRule).toMatch(/RRULE:FREQ=DAILY/);
  });

  it('without explicit the input keeps its old shape (NoteGeek)', () => {
    const { input } = toCreateInput(parseTaskInput('call /tomorrow', { now: NOW }), { today: NOW });
    expect(input).toEqual({ content: 'call', signifier: '*', dueDate: '2026-11-16' });
  });
});
