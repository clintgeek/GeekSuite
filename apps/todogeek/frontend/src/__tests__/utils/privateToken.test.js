/**
 * `(private)` in the add box's grammar: read out of the line wherever it is,
 * underlined in place, never eating the tokens around it; sent as
 * `private: true` only when present; and the tick box's add/remove is one
 * function over the line.
 */
import { describe, it, expect } from 'vitest';
import parseTaskInput, { parseTaskInputDetailed } from '../../utils/parseTaskInput';
import { describeParse, setPrivateToken, toCreateInput } from '../../utils/quickAdd';

process.env.TZ = 'America/Chicago';
const now = new Date(2026, 8, 29, 10, 0); // Tue 29 Sep 2026

const spanText = (line, spans, kind) => spans.filter((s) => s.kind === kind).map((s) => line.slice(s.start, s.end));

describe('(private)', () => {
  it('is read out of the words and underlined where it sits', () => {
    const line = 'Fire Jane (private)';
    const r = parseTaskInputDetailed(line, { now });
    expect(r.private).toBe(true);
    expect(r.content).toBe('Fire Jane');
    expect(spanText(line, r.spans, 'private')).toEqual(['(private)']);
  });

  it('does not eat the tokens around it', () => {
    const line = 'Finish write-up for David (private) #work !high tomorrow 2pm';
    const r = parseTaskInputDetailed(line, { now });
    expect(r.private).toBe(true);
    expect(r.content).toBe('Finish write-up for David');
    expect(r.tags).toEqual(['work']);
    expect(r.priority).toBe(1);
    expect(r.hasTime).toBe(true);
    expect(new Date(r.dueDate).getDate()).toBe(30);
    expect(new Date(r.dueDate).getHours()).toBe(14);
    expect(spanText(line, r.spans, 'private')).toEqual(['(private)']);
    expect(spanText(line, r.spans, 'tag')).toEqual(['#work']);
    expect(spanText(line, r.spans, 'date')).toEqual(['tomorrow 2pm']);
  });

  it('sits next to a repeat with no space and both are read', () => {
    const line = 'Pay Jane (weekly)(private)';
    const r = parseTaskInputDetailed(line, { now });
    expect(r.private).toBe(true);
    expect(r.recurrenceRule).toMatch(/FREQ=WEEKLY/);
    expect(r.content).toBe('Pay Jane');
  });

  it('after a ^note it still counts, and is not left in the note', () => {
    const r = parseTaskInput('Fire Jane ^talk to legal first (private)', { now });
    expect(r.private).toBe(true);
    expect(r.note).toBe('talk to legal first');
    expect(r.content).toBe('Fire Jane');
  });

  it('a plain-word date at the start still reads with the token at the end', () => {
    const r = parseTaskInput('tomorrow call Jane (private)', { now });
    expect(r.private).toBe(true);
    expect(r.content).toBe('call Jane');
    expect(new Date(r.dueDate).getDate()).toBe(30);
  });

  it('is case-blind, and typing it twice is one flag with no leftovers', () => {
    const r = parseTaskInput('(Private) Fire Jane (PRIVATE)', { now });
    expect(r.private).toBe(true);
    expect(r.content).toBe('Fire Jane');
  });

  it('only the exact token: "privately", "(privates)" and "private" are words', () => {
    for (const line of ['speak privately with Jane', 'pack the (privates) bag', 'book the private room']) {
      const r = parseTaskInput(line, { now });
      expect(r.private).toBeUndefined();
      expect(r.content).toBe(line);
    }
  });
});

describe('toCreateInput / describeParse', () => {
  it('sends private: true only when the token is there', () => {
    const yes = toCreateInput(parseTaskInput('Fire Jane (private)', { now }), { today: now }).input;
    expect(yes).toMatchObject({ content: 'Fire Jane', private: true });
    const no = toCreateInput(parseTaskInput('Buy milk', { now }), { today: now }).input;
    expect('private' in no).toBe(false);
  });

  it('says so to a screen reader', () => {
    expect(describeParse(parseTaskInputDetailed('Fire Jane (private)', { now }), now)).toMatch(/Private: hidden on a desktop/);
  });
});

describe('setPrivateToken — the tick box over the line', () => {
  it('adds the token at the end, once', () => {
    expect(setPrivateToken('Fire Jane', true)).toBe('Fire Jane (private)');
    expect(setPrivateToken('Fire Jane   ', true)).toBe('Fire Jane (private)');
    expect(setPrivateToken('Fire Jane (private)', true)).toBe('Fire Jane (private)');
    expect(setPrivateToken('', true)).toBe('(private) ');
  });

  it('takes every copy out, leaving the rest as typed', () => {
    expect(setPrivateToken('Fire Jane (private) #hr', false)).toBe('Fire Jane #hr');
    expect(setPrivateToken('(Private) Fire Jane (private)', false)).toBe('Fire Jane');
    expect(setPrivateToken('Fire Jane', false)).toBe('Fire Jane');
  });

  it('round-trips with the parser', () => {
    const on = setPrivateToken('call Jane tomorrow 2pm #hr', true);
    expect(parseTaskInput(on, { now }).private).toBe(true);
    expect(parseTaskInput(on, { now }).content).toBe('call Jane');
    expect(parseTaskInput(setPrivateToken(on, false), { now }).private).toBeUndefined();
  });
});
