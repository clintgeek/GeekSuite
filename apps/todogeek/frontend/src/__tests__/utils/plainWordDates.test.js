/**
 * Plain-word dates (SIMPLE_PLAN Phase 1): "tomorrow", "friday", "next week"
 * without the slash — only at the start or end, only when unambiguous. Every
 * case anchors on a fixed `now` (a Tuesday), never the wall clock.
 */
import { describe, it, expect } from 'vitest';
import parseTaskInput, { parseTaskInputDetailed } from '../../utils/parseTaskInput';

process.env.TZ = 'America/Chicago';

// Tuesday 29 September 2026, 10:15 local.
const now = new Date(2026, 8, 29, 10, 15);
const p = (text) => parseTaskInput(text, { now });
const ymd = (d) => [d.getFullYear(), d.getMonth() + 1, d.getDate()];

describe('plain-word dates', () => {
  it('reads "tomorrow" at the end', () => {
    const r = p('call Dana tomorrow');
    expect(r.content).toBe('call Dana');
    expect(ymd(r.dueDate)).toEqual([2026, 9, 30]);
    expect(r.hasTime).toBeUndefined();
  });

  it('reads "tomorrow" at the start', () => {
    const r = p('tomorrow call Dana');
    expect(r.content).toBe('call Dana');
    expect(ymd(r.dueDate)).toEqual([2026, 9, 30]);
  });

  it('reads a weekday as its next occurrence', () => {
    expect(ymd(p('send the invoice friday').dueDate)).toEqual([2026, 10, 2]);
    // Tuesday on a Tuesday is next week's, exactly like /tuesday.
    expect(ymd(p('standup notes tuesday').dueDate)).toEqual(ymd(p('standup notes /tuesday').dueDate));
    expect(ymd(p('standup notes tuesday').dueDate)).toEqual([2026, 10, 6]);
  });

  it('reads "next week" and "next monday"', () => {
    expect(ymd(p('renew the passport next week').dueDate)).toEqual([2026, 10, 6]);
    expect(ymd(p('book the vet next monday').dueDate)).toEqual([2026, 10, 5]);
  });

  it('takes "on", "by" or "due" with it at the end', () => {
    expect(p('call Dana on friday').content).toBe('call Dana');
    expect(p('ship it by friday').content).toBe('ship it');
    expect(p('the report due tomorrow').content).toBe('the report');
  });

  it('reads a time after it, and a time before it at the end', () => {
    const a = p('call Dana tomorrow 2pm');
    expect(a.content).toBe('call Dana');
    expect(a.hasTime).toBe(true);
    expect(a.dueDate.getHours()).toBe(14);
    const b = p('call Dana tomorrow at 9:30am');
    expect([b.dueDate.getHours(), b.dueDate.getMinutes()]).toEqual([9, 30]);
    const c = p('call Dana 2pm tomorrow');
    expect(c.content).toBe('call Dana');
    expect(ymd(c.dueDate)).toEqual([2026, 9, 30]);
    expect(c.dueDate.getHours()).toBe(14);
  });

  it('parses the Done-when example in full', () => {
    const r = p('call Dana tomorrow 2pm #work !high');
    expect(r.content).toBe('call Dana');
    expect(r.tags).toEqual(['work']);
    expect(r.priority).toBe(1);
    expect(ymd(r.dueDate)).toEqual([2026, 9, 30]);
    expect(r.dueDate.getHours()).toBe(14);
  });

  it('is not read mid-sentence', () => {
    const r = p('move the tomorrow meeting');
    expect(r.dueDate).toBeUndefined();
    expect(r.content).toBe('move the tomorrow meeting');
  });

  it('is not read after words that make it about the day, not due on it', () => {
    for (const text of ['buy tickets for friday', 'the notes from monday', 'water plants every monday', 'recap of last friday', 'wait until tomorrow']) {
      const r = p(text);
      expect(r.dueDate, text).toBeUndefined();
      expect(r.content, text).toBe(text);
    }
  });

  it('is not read when it is the whole task, or a possessive', () => {
    expect(p('Friday').dueDate).toBeUndefined();
    expect(p('Friday').content).toBe('Friday');
    expect(p('Friday’s standup notes').dueDate).toBeUndefined();
  });

  it('never reads a bare number as a time', () => {
    const r = p('call 3 people tomorrow');
    expect(r.content).toBe('call 3 people');
    expect(r.hasTime).toBeUndefined();
  });

  it('leaves the slash grammar canonical: a slash date wins, the word stays text', () => {
    const r = p('tomorrow retro /friday');
    expect(ymd(r.dueDate)).toEqual([2026, 10, 2]);
    expect(r.content).toBe('tomorrow retro');
  });

  it('reports where the date was, for the underline', () => {
    const text = 'call Dana tomorrow 2pm #work';
    const { spans } = parseTaskInputDetailed(text, { now });
    const date = spans.find((s) => s.kind === 'date');
    expect(text.slice(date.start, date.end)).toBe('tomorrow 2pm');
  });
});

describe('the signifier is the first character only', () => {
  it('no longer takes a hyphen or question mark from the middle or end', () => {
    expect(p('follow up re: Q3-plan').signifier).toBe('*');
    expect(p('follow up re: Q3-plan').content).toBe('follow up re: Q3-plan');
    expect(p('Is the permit transferable?').signifier).toBe('*');
    expect(p('Is the permit transferable?').content).toBe('Is the permit transferable?');
  });
  it('still reads it first', () => {
    expect(p('?Is the permit transferable').signifier).toBe('?');
    expect(p('- groceries').signifier).toBe('-');
  });
});
