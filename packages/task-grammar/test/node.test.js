/**
 * node.test.js — @geeksuite/task-grammar under plain Node
 * (SUITE_REVIEW_2026-11 C1).
 *
 * The grammar's full behaviour tests live in TodoGeek's frontend suite
 * (see src/index.js) and run under vitest. But the package has three
 * consumers — TodoGeek's add box, NoteGeek's handwritten journal, AND the
 * basegeek gateway, which imports it under plain Node ESM — and vitest
 * forgives things Node does not (an import without its `.js`, a browser-only
 * global at module scope). This file is the package's own CI job: it loads the
 * public entry under Node and pins the contract cases a regression would
 * ship to all three places, including the 6 pm Central = UTC-midnight one.
 *
 * Run with: node --test packages/task-grammar/test/*.test.js
 */

// Pinned before any Date work: the 6 pm case only exists west of UTC.
process.env.TZ = 'America/Chicago';

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseTaskInput,
  parseTaskInputDetailed,
  buildRecurrenceRule,
  frequencyFromRecurrenceRule,
  toCreateInput,
  avoidUtcMidnight,
  localTimeZone,
} from '../src/index.js';

// Monday 2026-11-16, 09:00 in Chicago.
const NOW = new Date('2026-11-16T15:00:00Z');

test('the public entry loads under Node with every documented export', () => {
  for (const fn of [parseTaskInput, parseTaskInputDetailed, buildRecurrenceRule, frequencyFromRecurrenceRule, toCreateInput, avoidUtcMidnight, localTimeZone]) {
    assert.equal(typeof fn, 'function');
  }
});

const CASES = [
  ['Buy milk #home /tomorrow 9am !high', {
    content: 'Buy milk', tags: ['home'], priority: 1, hasTime: true, dueDate: '2026-11-17T15:00:00.000Z',
  }],
  // Plain-word dates are not read after "for": this is about Friday, not due on it.
  ['tickets for friday', { content: 'tickets for friday', dueDate: undefined }],
  // The signifier is the FIRST character only.
  ['Call Bob re: Q3-plan', { content: 'Call Bob re: Q3-plan', signifier: '*' }],
  ['pay rent ~blocked waiting on bank', { content: 'pay rent', blocked: true, blockedReason: 'waiting on bank' }],
  // Tag standard: kebab-case, `/` nests; `C#` is not a tag.
  ['learn C# #GeekSuite #home/garage', { tags: ['geek-suite', 'home/garage'] }],
];

for (const [line, expected] of CASES) {
  test(`parses ${ JSON.stringify(line) }`, () => {
    const got = parseTaskInput(line, { now: NOW });
    for (const [key, value] of Object.entries(expected)) {
      const actual = got[key] instanceof Date ? got[key].toISOString() : got[key];
      assert.deepEqual(actual, value, `${ key } of ${ JSON.stringify(line) }`);
    }
  });
}

test('(daily) becomes an RRULE that reads back as daily', () => {
  const got = parseTaskInput('water plants (daily)', { now: NOW });
  assert.equal(got.content, 'water plants');
  assert.match(got.recurrenceRule, /RRULE:FREQ=DAILY/);
  assert.equal(frequencyFromRecurrenceRule(got.recurrenceRule), 'daily');
});

test('6 pm Central is UTC midnight: a timed task is never sent as exactly midnight', () => {
  const parsed = parseTaskInput('Dinner /tomorrow 6pm', { now: NOW });
  const { input } = toCreateInput(parsed, { today: NOW, explicit: true, timeZone: 'America/Chicago' });
  const due = new Date(input.dueDate);
  assert.equal(input.hasDueTime, true);
  assert.notEqual(due.toISOString(), '2026-11-18T00:00:00.000Z');
  assert.equal(due.getTime() - Date.parse('2026-11-18T00:00:00.000Z'), 1000);
});

test('a date with no time is date-only, not an instant', () => {
  const parsed = parseTaskInput('Renew passport /tomorrow', { now: NOW });
  const { input } = toCreateInput(parsed, { today: NOW, explicit: true, timeZone: 'America/Chicago' });
  assert.equal(input.dueDate, '2026-11-17');
  assert.notEqual(input.hasDueTime, true);
});

test('avoidUtcMidnight leaves every other instant alone', () => {
  const t = new Date('2026-11-17T15:30:00Z');
  assert.equal(avoidUtcMidnight(t).toISOString(), t.toISOString());
});
