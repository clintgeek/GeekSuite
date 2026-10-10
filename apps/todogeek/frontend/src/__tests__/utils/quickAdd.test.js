import { describe, it, expect } from 'vitest';
import { parseTaskInputDetailed } from '../../utils/parseTaskInput';
import { describeParse, toCreateInput } from '../../utils/quickAdd';

process.env.TZ = 'America/Chicago';
const now = new Date(2026, 8, 29, 10, 15);
const parse = (text) => parseTaskInputDetailed(text, { now });
const build = (text) => toCreateInput(parse(text), { today: now });

describe('toCreateInput', () => {
  it('files an undated entry for today, date-only (no phantom 9:00)', () => {
    expect(build('buy milk').input.dueDate).toBe('2026-09-29');
  });

  it('sends a date without a time as date-only, and a typed time as the instant', () => {
    expect(build('call Dana tomorrow').input.dueDate).toBe('2026-09-30');
    const timed = build('call Dana tomorrow 2pm').input.dueDate;
    expect(timed).toBeInstanceOf(Date);
    expect([timed.getDate(), timed.getHours()]).toEqual([30, 14]);
  });

  it('turns ~blocked into a #blocked tag, keeping the reason in the note', () => {
    const { input } = build('Ship the invoice #work ~blocked waiting on legal');
    expect(input.tags).toEqual(['work', 'blocked']);
    expect(input.note).toBe('Blocked: waiting on legal');
    expect(input).not.toHaveProperty('blocked');
    expect(input).not.toHaveProperty('blockedReason');
  });

  it('does not add #blocked twice', () => {
    expect(build('Ship it #blocked ~blocked').input.tags).toEqual(['blocked']);
  });

  it('keeps $^ out of the task and hands it to NoteGeek', () => {
    const { input, noteGeekNote } = build('Write blog $^Draft ideas here');
    expect(input.note).toBeUndefined();
    expect(noteGeekNote).toBe('Draft ideas here');
  });

  it('adds nothing when no words are left', () => {
    expect(build('#work !high').input).toBeNull();
  });
});

describe('describeParse — what a screen reader hears', () => {
  it('says every part it understood', () => {
    expect(describeParse(parse('call Dana tomorrow 2pm #work !high'), now))
      .toBe('Task: call Dana. Due tomorrow at 2 pm. High priority. Tagged work.');
  });
  it('says "due today" when no date was typed', () => {
    expect(describeParse(parse('buy milk'), now)).toBe('Task: buy milk. Due today.');
  });
  it('names the kind and the parked tag', () => {
    expect(describeParse(parse('@standup ~blocked'), now)).toBe('Task: standup. Marked as an event. Due today. Tagged blocked.');
  });
  it('explains the box when empty', () => {
    expect(describeParse(null, now)).toBe('Type a task and press Enter.');
  });
});
