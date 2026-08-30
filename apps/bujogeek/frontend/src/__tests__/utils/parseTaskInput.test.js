import { describe, it, expect } from 'vitest';
import parseTaskInput, {
  buildRecurrenceRule,
  frequencyFromRecurrenceRule,
} from '../../utils/parseTaskInput';

describe('parseTaskInput', () => {
  it('defaults to the task signifier and returns plain content', () => {
    const result = parseTaskInput('Buy milk');
    expect(result.signifier).toBe('*');
    expect(result.content).toBe('Buy milk');
    expect(result.priority).toBeUndefined();
    expect(result.dueDate).toBeUndefined();
    expect(result.tags).toBeUndefined();
    expect(result.note).toBeUndefined();
    expect(result.noteGeekNote).toBeUndefined();
    expect(result.recurrenceRule).toBeUndefined();
  });

  it.each([
    ['@Meeting with team', '@', 'Meeting with team'],
    ['-Grocery list', '-', 'Grocery list'],
    ['?Should I call him', '?', 'Should I call him'],
    ['!Important reminder', '!', 'Important reminder'],
  ])('parses signifier %s', (input, signifier, content) => {
    const result = parseTaskInput(input);
    expect(result.signifier).toBe(signifier);
    expect(result.content).toBe(content);
  });

  it.each([
    ['Do laundry !high', 1, 'Do laundry'],
    ['Do laundry !medium', 2, 'Do laundry'],
    ['Do laundry !low', 3, 'Do laundry'],
  ])('parses priority from %s', (input, priority, content) => {
    const result = parseTaskInput(input);
    expect(result.priority).toBe(priority);
    expect(result.content).toBe(content);
  });

  it('does not mistake !high for the ! signifier', () => {
    const result = parseTaskInput('Do laundry !high');
    expect(result.signifier).toBe('*');
  });

  it('extracts multiple #tags and strips them from content', () => {
    const result = parseTaskInput('Plan trip #travel #vacation');
    expect(result.tags).toEqual(['travel', 'vacation']);
    expect(result.content).toBe('Plan trip');
  });

  it('parses a ^note anchored at the end', () => {
    const result = parseTaskInput('Buy milk ^remember reusable bags');
    expect(result.note).toBe('remember reusable bags');
    expect(result.noteGeekNote).toBeUndefined();
    expect(result.content).toBe('Buy milk');
  });

  it('parses a $^ NoteGeek note in preference to a plain note', () => {
    const result = parseTaskInput('Write blog $^Draft ideas here');
    expect(result.noteGeekNote).toBe('Draft ideas here');
    expect(result.note).toBeUndefined();
    expect(result.content).toBe('Write blog');
  });

  it('resolves /tomorrow to the next calendar day at 9am by default', () => {
    const before = new Date();
    const result = parseTaskInput('Call mom /tomorrow');

    const expected = new Date(before);
    expected.setDate(expected.getDate() + 1);

    expect(result.content).toBe('Call mom');
    expect(result.dueDate.getFullYear()).toBe(expected.getFullYear());
    expect(result.dueDate.getMonth()).toBe(expected.getMonth());
    expect(result.dueDate.getDate()).toBe(expected.getDate());
    expect(result.dueDate.getHours()).toBe(9);
    expect(result.dueDate.getMinutes()).toBe(0);
  });

  it('resolves an explicit month-name + day date', () => {
    // NOTE: hyphenated forms like /2026-03-15 are NOT exercised here — the
    // signifier scan (step 4) runs before date parsing (step 5) and its
    // char class includes '-', so it currently matches the hyphen *inside*
    // a slash-date before the date pattern gets a chance to consume it,
    // corrupting the parse. That's a pre-existing bug outside this task's
    // scope (not one of the weekend RRULE fixes); flagging rather than
    // silently working around it in a way that would mask it.
    const result = parseTaskInput('Renew passport /mar 15');
    expect(result.dueDate.getFullYear()).toBe(new Date().getFullYear());
    expect(result.dueDate.getMonth()).toBe(2); // 0-indexed: March
    expect(result.dueDate.getDate()).toBe(15);
  });

  it('applies an explicit pm time on top of a parsed date', () => {
    const result = parseTaskInput('Dentist /mar 15 2pm');
    expect(result.dueDate.getHours()).toBe(14);
    expect(result.dueDate.getMinutes()).toBe(0);
  });

  describe('recurrence -> RRULE (unified, no legacy recurrencePattern)', () => {
    it.each([
      ['(daily) Take vitamins', 'DAILY'],
      ['(weekly) Water the plants', 'WEEKLY'],
      ['(monthly) Pay rent', 'MONTHLY'],
    ])('emits recurrenceRule for %s', (input, freq) => {
      const result = parseTaskInput(input);
      expect(result.recurrenceRule).toContain(`RRULE:FREQ=${freq}`);
      expect(result.recurrenceRule).toMatch(/^DTSTART:\d{8}T\d{6}Z\n/);
      // The legacy enum must never be produced.
      expect(result.recurrencePattern).toBeUndefined();
      expect(Object.keys(result)).not.toContain('recurrencePattern');
    });

    it('anchors DTSTART on the parsed due date, not "now"', () => {
      const result = parseTaskInput('(weekly) Water plants /mar 15');
      expect(result.dueDate.getFullYear()).toBe(new Date().getFullYear());
      expect(result.dueDate.getMonth()).toBe(2);
      expect(result.dueDate.getDate()).toBe(15);
      // The rule built directly from the parsed dueDate must match exactly —
      // proving the parser anchored on it rather than on "now".
      expect(result.recurrenceRule).toBe(buildRecurrenceRule('weekly', result.dueDate));
    });

    it('falls back to a "now" anchor when no due date was parsed', () => {
      const result = parseTaskInput('(daily) Take vitamins');
      expect(result.dueDate).toBeUndefined();
      expect(result.recurrenceRule).toMatch(/^DTSTART:\d{8}T\d{6}Z\nRRULE:FREQ=DAILY$/);
      expect(frequencyFromRecurrenceRule(result.recurrenceRule)).toBe('daily');
    });
  });

  it('combines signifier, priority, tags, recurrence, date and note together', () => {
    const result = parseTaskInput(
      '*Team meeting !high #work #urgent (weekly) /monday 2pm ^Bring laptop',
    );
    expect(result.signifier).toBe('*');
    expect(result.priority).toBe(1);
    expect(result.tags).toEqual(['work', 'urgent']);
    expect(result.note).toBe('Bring laptop');
    expect(result.content).toBe('Team meeting');
    expect(result.dueDate.getDay()).toBe(1); // Monday
    expect(result.dueDate.getHours()).toBe(14);
    expect(result.recurrenceRule).toContain('RRULE:FREQ=WEEKLY');
    expect(result.recurrenceRule).toBe(buildRecurrenceRule('weekly', result.dueDate));
    expect(result.recurrencePattern).toBeUndefined();
  });
});

describe('buildRecurrenceRule', () => {
  it('builds a canonical DTSTART + RRULE string anchored on the given date', () => {
    const rule = buildRecurrenceRule('weekly', new Date('2026-03-15T09:00:00.000Z'));
    expect(rule).toBe('DTSTART:20260315T090000Z\nRRULE:FREQ=WEEKLY');
  });

  it('is case-insensitive on the frequency word', () => {
    const rule = buildRecurrenceRule('DAILY', new Date('2026-01-01T00:00:00.000Z'));
    expect(rule).toContain('FREQ=DAILY');
  });

  it('returns null for an unknown frequency', () => {
    expect(buildRecurrenceRule('yearly', new Date())).toBeNull();
    expect(buildRecurrenceRule(null, new Date())).toBeNull();
    expect(buildRecurrenceRule(undefined, new Date())).toBeNull();
  });

  it('returns null instead of an "Invalid Date" RRULE for a bad start date', () => {
    expect(buildRecurrenceRule('daily', 'not-a-date')).toBeNull();
  });

  it('defaults to today at 9am when no start date is given', () => {
    const rule = buildRecurrenceRule('monthly');
    expect(rule).toMatch(/^DTSTART:\d{8}T\d{6}Z\nRRULE:FREQ=MONTHLY$/);
  });
});

describe('frequencyFromRecurrenceRule', () => {
  it('round-trips a rule built by buildRecurrenceRule', () => {
    const rule = buildRecurrenceRule('weekly', new Date('2026-03-15T09:00:00.000Z'));
    expect(frequencyFromRecurrenceRule(rule)).toBe('weekly');
  });

  it.each([
    ['DTSTART:20260315T090000Z\nRRULE:FREQ=DAILY', 'daily'],
    ['DTSTART:20260315T090000Z\nRRULE:FREQ=WEEKLY', 'weekly'],
    ['DTSTART:20260315T090000Z\nRRULE:FREQ=MONTHLY', 'monthly'],
  ])('reads %s back as %s', (rule, freq) => {
    expect(frequencyFromRecurrenceRule(rule)).toBe(freq);
  });

  it('returns "none" for a missing or unrecognized rule', () => {
    expect(frequencyFromRecurrenceRule(null)).toBe('none');
    expect(frequencyFromRecurrenceRule(undefined)).toBe('none');
    expect(frequencyFromRecurrenceRule('')).toBe('none');
    expect(frequencyFromRecurrenceRule('garbage')).toBe('none');
  });
});
