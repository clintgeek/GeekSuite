/**
 * journalLines — a transcript read as a bullet journal, through TodoGeek's
 * own grammar (DOCS/BUJO_HANDWRITING.md).
 */
import { describe, it, expect } from 'vitest';
import {
  journalLines, readMark, taskInputFor, summarize, lineKey, KIND,
  sendTaskRows, sentKeysFor, looseKey, rowEdits, applyLineEdits, writtenAnchor,
} from '../../utils/journalLines';
import { journalMarkAsMarkdown } from '../../utils/sketchToText';

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
  '1. numbered is offered',
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
      ['numbered', 'numbered is offered'],
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
    expect(on).toEqual({ task: true, done: false, event: true, note: false, important: true, question: true, migrated: false, scheduled: false, numbered: false });
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
  // `hasDueTime` is the shared grammar's own field (packages/task-grammar, being
  // changed alongside this work); these tests are about the journal's mapping.
  const input = (line, o = {}) => {
    const got = taskInputFor(journalLines(line)[0], { now: NOW, ...o });
    if (got) delete got.hasDueTime;
    return got;
  };

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

describe('journal reading mistakes (review 2.9)', () => {
  it('a second mark is stripped, and the more specific one wins over a dot', () => {
    expect(readMark('! * call bob')).toEqual({ kind: 'important', text: 'call bob' });
    expect(readMark('* ! call bob')).toEqual({ kind: 'important', text: 'call bob' });
    // a letter after a dot is a word, not a mark
    expect(readMark('* x ray results')).toEqual({ kind: 'task', text: 'x ray results' });
  });

  it('a line of marks with no words is not an entry', () => {
    expect(readMark('* * *')).toBeNull();
    expect(readMark('- - -')).toBeNull();
  });

  it('x, > and < need a letter after them: counts and quantities are not done or migrated', () => {
    expect(readMark('x 3 sets of 10')).toBeNull();
    expect(readMark('> 5 kg flour')).toBeNull();
    expect(readMark('< 2 hours')).toBeNull();
    expect(readMark('x renew passport')).toEqual({ kind: 'done', text: 'renew passport' });
    expect(readMark('> finish it')).toEqual({ kind: 'migrated', text: 'finish it' });
  });

  it('accepts [ ] with no space after it, as the prompt writes it', () => {
    expect(readMark('[ ]buy milk')).toEqual({ kind: 'task', text: 'buy milk' });
    expect(readMark('[x]pay rent')).toEqual({ kind: 'done', text: 'pay rent' });
  });

  it('numbered lines are offered, unticked', () => {
    const [e] = journalLines('1. call bob');
    expect(e).toMatchObject({ kind: 'numbered', text: 'call bob', defaultOn: false });
    expect(readMark('2) book the venue')).toEqual({ kind: 'numbered', text: 'book the venue' });
  });

  it('"Keep as plain text" reads the same table as Send tasks', () => {
    expect(journalMarkAsMarkdown('[ ]buy milk')).toBe('- [ ] buy milk');
    expect(journalMarkAsMarkdown('x 3 sets of 10')).toBe('x 3 sets of 10');
    expect(journalMarkAsMarkdown('× renew passport')).toBe('- [x] renew passport');
    expect(journalMarkAsMarkdown('◯ team lunch')).toBe('- ○ team lunch');
    // Every line Send tasks calls "done" is a ticked box in Markdown, and back.
    for (const line of ['x renew passport', '[x] pay rent', '✓ filed taxes', '- [x] already']) {
      expect(readMark(line).kind).toBe('done');
      expect(journalMarkAsMarkdown(line)).toMatch(/^- \[x\] /);
    }
  });
});

describe('"already sent", loosely (review 1.11)', () => {
  it('a corrected word, then a fresh reading of the same ink, comes back unticked as "Probably already sent"', () => {
    // Read as "Bbo", corrected to "Bob" in the dialog, sent.
    const [row] = sendTaskRows('* call Bbo about the fence');
    const sent = sentKeysFor({ ...row, text: 'call Bob about the fence' });
    // A later reading of the page reads it a third way.
    const again = sendTaskRows('* call Bbb about the fence', sent);
    expect(again[0]).toMatchObject({ sent: false, probablySent: true, on: false });
    // The words exactly as sent: also caught.
    expect(sendTaskRows('* call Bob about the fence', sent)[0]).toMatchObject({ probablySent: true, on: false });
  });

  it('an exact line already sent is "Already sent"; a different line is offered ticked', () => {
    const [row] = sendTaskRows('* buy milk');
    const sent = sentKeysFor(row);
    expect(sendTaskRows('* buy milk', sent)[0]).toMatchObject({ sent: true, on: false });
    expect(sendTaskRows('* call the roofer', sent)[0]).toMatchObject({ sent: false, probablySent: false, on: true });
  });

  it('old exact-only keys still work, and short lines are never matched loosely', () => {
    const old = [lineKey('task', 'buy milk')];
    expect(sendTaskRows('* buy milk', old)[0].sent).toBe(true);
    expect(sendTaskRows('* tea', [looseKey('pea')])[0].probablySent).toBe(false);
  });

  it('keys fit the gateway (1–80 characters)', () => {
    const [row] = sendTaskRows(`* ${'a very long line '.repeat(20)}`);
    for (const k of sentKeysFor(row)) expect(k.length).toBeGreaterThan(0), expect(k.length).toBeLessThanOrEqual(80);
  });

  it('edits in the dialog become corrections to the transcript, in place', () => {
    const text = 'Standup\n* call Bbo /friday\n- a note';
    const rows = sendTaskRows(text).map((r) => (r.kind === 'task' ? { ...r, text: 'call Bob /friday' } : r));
    const edits = rowEdits(rows);
    expect(edits).toEqual([{ line: 1, from: 'call Bbo /friday', to: 'call Bob /friday' }]);
    expect(applyLineEdits(text, edits)).toBe('Standup\n* call Bob /friday\n- a note');
    expect(applyLineEdits(text, [])).toBeNull();
  });
});

describe('relative dates read from the day the page was written (review 2.10, D6)', () => {
  // Written Monday 16 Nov 2026; sent Wednesday 18 Nov.
  const MONDAY = new Date(2026, 10, 16, 9, 30);
  const WEDNESDAY = new Date(2026, 10, 18, 10, 0);

  it('an older page anchors; a page from today does not', () => {
    const w = writtenAnchor(MONDAY.toISOString(), { today: WEDNESDAY });
    expect(w.anchor.getTime()).toBe(MONDAY.getTime());
    expect(w.label).toBe('Written Mon 16 Nov · dates read from then');
    expect(writtenAnchor(new Date(2026, 10, 18, 8).toISOString(), { today: WEDNESDAY })).toBeNull();
    expect(writtenAnchor(null)).toBeNull();
  });

  it('"tomorrow" on Monday\'s page is Tuesday; an undated line still lands on today', () => {
    const [call] = journalLines('* call Bob tomorrow');
    expect(taskInputFor(call, { now: MONDAY, today: WEDNESDAY }).dueDate).toBe('2026-11-17');
    expect(taskInputFor(call, { now: WEDNESDAY }).dueDate).toBe('2026-11-19');
    const [plain] = journalLines('* call Bob');
    expect(taskInputFor(plain, { now: MONDAY, today: WEDNESDAY }).dueDate).toBe('2026-11-18');
  });
});
