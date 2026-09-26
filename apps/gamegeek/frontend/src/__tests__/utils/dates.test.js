import { describe, it, expect } from 'vitest';
import { relativeDay, relativeInstant } from '../../utils/dates';

// vitest runs with TZ=America/Chicago (vitest.config.js). 19:08 CDT on the
// 25th is already 00:08 UTC on the 26th — the evening CI caught this in.
const EVENING = new Date('2026-09-26T00:08:00Z');

describe('relativeInstant — instants, read in the viewer\'s timezone', () => {
  it('an import five minutes ago is "Today", even after 7 PM Central', () => {
    expect(relativeInstant('2026-09-26T00:03:00Z', EVENING)).toBe('Today');
  });
  it('late last night is "Yesterday"', () => {
    expect(relativeInstant('2026-09-25T03:00:00Z', EVENING)).toBe('Yesterday'); // 22:00 CDT on the 24th
  });
  it('a few days back counts local days', () => {
    expect(relativeInstant('2026-09-22T15:00:00Z', EVENING)).toBe('3 days ago');
  });
  it('empty and junk are empty', () => {
    expect(relativeInstant(null, EVENING)).toBe('');
    expect(relativeInstant('nope', EVENING)).toBe('');
  });
});

describe('relativeDay — calendar days stored as UTC midnight (unchanged)', () => {
  it('a session logged for the 25th is "Today" on the evening of the 25th', () => {
    expect(relativeDay('2026-09-25T00:00:00.000Z', EVENING)).toBe('Today');
  });
  it('is the wrong tool for an instant — this is the bug relativeInstant exists for', () => {
    expect(relativeDay('2026-09-26T00:03:00Z', EVENING)).not.toBe('Today');
  });
});
