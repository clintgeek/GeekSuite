// UX review 2026-11-18, FlockGeek 10: the lists printed "6/1/2024" and
// "11/18/2026" beside Home's "Nov 18". One short format everywhere now.
import { describe, it, expect, afterEach } from 'vitest';
import { formatDay, formatInstantDay } from '../utils/formatDate';

const REAL_TZ = process.env.TZ;
afterEach(() => {
  if (REAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = REAL_TZ;
});

describe('formatDay', () => {
  const now = new Date('2026-11-18T15:00:00.000Z');

  it('drops the year this year and keeps it otherwise', () => {
    expect(formatDay('2026-11-18T00:00:00.000Z', now)).toBe('18 Nov');
    expect(formatDay('2024-06-01T00:00:00.000Z', now)).toBe('1 Jun 2024');
  });

  it('reads a stored calendar day as UTC, so it never slips west of Greenwich', () => {
    process.env.TZ = 'America/Chicago';
    expect(formatDay('2026-11-18T00:00:00.000Z', now)).toBe('18 Nov');
  });

  it('is empty for a missing value', () => {
    expect(formatDay(null, now)).toBe('');
    expect(formatDay('', now)).toBe('');
    expect(formatDay('not a date', now)).toBe('');
  });
});

describe('formatInstantDay', () => {
  it('reads an instant in the viewer\'s own day', () => {
    process.env.TZ = 'America/Chicago';
    const now = new Date('2026-11-18T15:00:00.000Z');
    // 02:00 UTC on the 18th is still the evening of the 17th in Chicago.
    expect(formatInstantDay('2026-11-18T02:00:00.000Z', now)).toBe('17 Nov');
  });
});
