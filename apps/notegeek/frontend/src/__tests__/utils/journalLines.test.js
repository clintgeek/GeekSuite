/**
 * journalLines — a transcript read as a bullet journal, through TodoGeek's
 * own grammar (DOCS/BUJO_HANDWRITING.md).
 */
import { describe, it, expect } from 'vitest';
import { journalLines, readMark, taskInputFor, summarize, lineKey, KIND } from '../../utils/journalLines';

// A Wednesday, so "friday" is two days on.
const NOW = new Date(2026, 10, 11, 10, 0, 0);

const PAGE = [
  '# Standup',
  'talked about the launch',
  '* call the roofer /friday !high #house',
  '[ ] book flights',
  'x renew passport',
  '[x] pay rent',
  'o dentist tomorrow 2pm',
  '- the old site goes away in March',
  '! ask about the warranty',
  '? who owns the DNS',
  '> finish the report',
  '< plan Q1',
  '--- page 2 ---',
  '[drawing: a house]',
  '1. numbered is prose',
  '-> an arrow is prose',
  '!high alone is prose',
].join('\n');

describe('reading the marks', () => {
  it('each opening mark is its own kind; lines without one are prose', () => {
    const kinds = journalLines(PAGE).map((e) => [e.kind, e.text]);
    expect(kinds).toEqual([
      ['task', 'call the roofer /friday !high #house'],
      ['task', 'book flights'],
      ['done', 'renew passport'],
      ['done', 'pay rent'],
      ['event', 'dentist tomorrow 2pm'],
      ['note', 'the old site goes away in March'],
      ['important', 'ask about the warranty'],
      ['question', 'who owns the DNS'],
      ['migrated', 'finish the report'],
      ['scheduled', 'plan Q1'],
    ]);
  });

  it('handwriting-style glyphs read the same as their ASCII marks', () => {
    expect(readMark('• buy milk')).toEqual({ kind: 'task', text: 'buy milk' });
    expect(readMark('× buy milk')).toEqual({ kind: 'done', text: 'buy milk' });
    expect(readMark('○ team lunch')).toEqual({ kind: 'event', text: 'team lunch' });
    expect(readMark('– a thought')).toEqual({ kind: 'note', text: 'a thought' });
    expect(readMark('- [ ] markdown task')).toEqual({ kind: 'task', text: 'markdown task' });
    expect(readMark('  * indented')).toEqual({ kind: 'task', text: 'indented' });
    expect(readMark('#work')).toBeNull();
    expect(readMark('*bold* words')).toBeNull();
    expect(readMark('* ')).toBeNull();
  });

  it('open things are offered ticked; done, notes and already-moved lines are not', () => {
    const on = Object.fromEntries(journalLines(PAGE).map((e) => [e.kind, e.defaultOn]));
    expect(on).toEqual({ task: true, done: false, event: true, note: false, important: true, question: true, migrated: false, scheduled: false });
  });

  it('a word the model could not read is flagged', () => {
    const [e] = journalLines('* call [?] about the roof');
    expect(e.unsure).toBe(true);
    expect(journalLines('* call Bob')[0].unsure).toBe(false);
  });

  it('keys are stable for a line, differ by kind, and tell repeated lines apart', () => {
    expect(lineKey('task', 'Buy  Milk')).toBe(lineKey('task', 'buy milk'));
    expect(lineKey('task', 'buy milk')).not.toBe(lineKey('done', 'buy milk'));
    const keys = journalLines('* buy milk\n* buy milk').map((e) => e.key);
    expect(new Set(keys).size).toBe(2);
    expect(keys.every((k) => k.length <= 80)).toBe(true);
  });
});

describe("the task each line becomes — TodoGeek's own grammar", () => {
  const input = (line, o = {}) => taskInputFor(journalLines(line)[0], { now: NOW, ...o });

  it('reads /dates, !priority and #tags exactly as the add box does', () => {
    expect(input('* call the roofer /friday !high #house')).toEqual({
      content: 'call the roofer', signifier: '*', dueDate: '2026-11-13', priority: 1, tags: ['house'],
    });
  });

  it('no date means today, date-only (the add box rule)', () => {
    expect(input('[ ] book flights')).toEqual({ content: 'book flights', signifier: '*', dueDate: '2026-11-11' });
  });

  it('a plain-word date with a time is sent as the instant', () => {
    const got = input('o dentist tomorrow 2pm');
    expect(got.signifier).toBe('@');
    expect(got.content).toBe('dentist');
    expect(new Date(got.dueDate).getTime()).toBe(new Date(2026, 10, 12, 14, 0, 0).getTime());
  });

  it('the mark decides the kind: done is completed, a dash a note, ! and ? keep their signifier', () => {
    expect(input('x renew passport')).toMatchObject({ signifier: '*', status: 'completed', content: 'renew passport' });
    expect(input('- the old site goes away')).toMatchObject({ signifier: '-' });
    expect(input('! ask about the warranty')).toMatchObject({ signifier: '!' });
    expect(input('? who owns the DNS')).toMatchObject({ signifier: '?' });
    expect(input('> finish the report')).toMatchObject({ signifier: '*' });
    expect(input('> finish the report').status).toBeUndefined();
  });

  it('says which sketch it came from, after any note the line carried', () => {
    const got = input('* call Bob ^about the fence', { sketch: { id: 'abc', title: 'Standup' }, origin: 'https://notegeek.example' });
    expect(got.note).toBe('about the fence\nFrom sketch: Standup — https://notegeek.example/notes/abc');
    expect(input('* call Bob', { sketch: { id: 'abc', title: '' }, origin: 'https://n' }).note).toBe('From sketch: Untitled sketch — https://n/notes/abc');
  });

  it('a line that is only modifiers has no task in it', () => {
    expect(taskInputFor({ kind: 'task', text: '#work /friday' }, { now: NOW })).toBeNull();
  });

  it('every kind maps to a signifier the gateway accepts', () => {
    const allowed = ['*', '@', 'x', '<', '>', '-', '!', '?', '#'];
    for (const k of Object.values(KIND)) expect(allowed).toContain(k.signifier);
  });
});

describe('the summary under each line', () => {
  it('says what was understood, quietly', () => {
    expect(summarize('call the roofer /friday !high #house', { now: NOW })).toMatch(/^Due Fri.*13.*· High priority · #house$/);
    expect(summarize('book flights', { now: NOW })).toBe('Due today');
    expect(summarize('#work', { now: NOW })).toBe('No words left for the task itself');
  });
});
