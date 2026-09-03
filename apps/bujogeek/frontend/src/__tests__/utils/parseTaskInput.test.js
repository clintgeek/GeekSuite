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
    const result = parseTaskInput('Renew passport /mar 15');
    expect(result.dueDate.getFullYear()).toBe(new Date().getFullYear());
    expect(result.dueDate.getMonth()).toBe(2); // 0-indexed: March
    expect(result.dueDate.getDate()).toBe(15);
  });

  it('resolves a hyphenated /YYYY-MM-DD date without the signifier eating the hyphen', () => {
    const result = parseTaskInput('File taxes /2026-03-15');
    expect(result.dueDate.getFullYear()).toBe(2026);
    expect(result.dueDate.getMonth()).toBe(2); // March
    expect(result.dueDate.getDate()).toBe(15);
    expect(result.content).toBe('File taxes');
    expect(result.signifier).toBe('*'); // default task, not '-'
  });

  it('resolves a hyphenated /MM-DD-YYYY date', () => {
    const result = parseTaskInput('Trip /03-15-2026');
    expect(result.dueDate.getFullYear()).toBe(2026);
    expect(result.dueDate.getMonth()).toBe(2);
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

  describe('~blocked', () => {
    it('parses a bare ~blocked with no reason', () => {
      const result = parseTaskInput('Ship the invoice ~blocked');
      expect(result.blocked).toBe(true);
      expect(result.blockedReason).toBeUndefined();
      expect(result.content).toBe('Ship the invoice');
    });

    it('captures the reason after ~blocked', () => {
      const result = parseTaskInput('Ship the invoice ~blocked waiting on legal');
      expect(result.blocked).toBe(true);
      expect(result.blockedReason).toBe('waiting on legal');
      expect(result.content).toBe('Ship the invoice');
    });

    it('is case-insensitive on the token', () => {
      const result = parseTaskInput('Ship it ~BLOCKED Waiting On Legal');
      expect(result.blocked).toBe(true);
      expect(result.blockedReason).toBe('Waiting On Legal');
      expect(result.content).toBe('Ship it');
    });

    it('leaves blocked fields undefined when the token is absent', () => {
      const result = parseTaskInput('Ship the invoice');
      expect(result.blocked).toBeUndefined();
      expect(result.blockedReason).toBeUndefined();
    });

    it('does not fire on a bare ~, a lookalike word, or the word alone', () => {
      expect(parseTaskInput('Ship it ~').blocked).toBeUndefined();
      // The reason must be whitespace-separated, so `~blockedish` is not the token.
      expect(parseTaskInput('Ship it ~blockedish thing').blocked).toBeUndefined();
      expect(parseTaskInput('Ship it blocked on legal').blocked).toBeUndefined();
    });

    it('keeps a reason that only appears mid-line out of it (must be last)', () => {
      const result = parseTaskInput('Ship it ~blocked waiting, then invoice');
      expect(result.blockedReason).toBe('waiting, then invoice');
    });

    it('combines with tags, priority, date and recurrence', () => {
      const result = parseTaskInput('*Send contract !high #legal /monday 2pm ~blocked waiting on their counsel');
      expect(result.blocked).toBe(true);
      expect(result.blockedReason).toBe('waiting on their counsel');
      expect(result.signifier).toBe('*');
      expect(result.priority).toBe(1);
      expect(result.tags).toEqual(['legal']);
      expect(result.dueDate.getDay()).toBe(1);
      expect(result.dueDate.getHours()).toBe(14);
      expect(result.content).toBe('Send contract');
    });

    it('keeps a token-ish reason intact: !high inside the reason is not a priority', () => {
      const result = parseTaskInput('Ship it ~blocked blocked by the !high ticket');
      expect(result.blockedReason).toBe('blocked by the !high ticket');
      expect(result.priority).toBeUndefined();
      expect(result.content).toBe('Ship it');
    });

    it('yields to ^note, which shares the end-of-line anchor', () => {
      // Documented limitation: the note token is read first, so a ~blocked
      // written after it becomes part of the note.
      const result = parseTaskInput('Ship it ^see the thread ~blocked waiting');
      expect(result.note).toBe('see the thread ~blocked waiting');
      expect(result.blocked).toBeUndefined();
    });

    it('parses ~blocked when the note token comes after it', () => {
      const result = parseTaskInput('Ship it ~blocked waiting ^see the thread');
      expect(result.note).toBe('see the thread');
      expect(result.blocked).toBe(true);
      expect(result.blockedReason).toBe('waiting');
      expect(result.content).toBe('Ship it');
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
