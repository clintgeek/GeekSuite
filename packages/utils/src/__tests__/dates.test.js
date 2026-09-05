import { describe, it, expect, afterEach } from 'vitest';
import {
  toUtcMidnight,
  utcMidnightToday,
  utcDayRange,
  utcDateString,
  displayCalendarDate,
  localDateString,
  startOfLocalDay,
} from '../dates.js';

/**
 * Node re-reads `process.env.TZ` on every date operation (v16+), so we can
 * drive the host timezone from inside the test. Every local-time assertion
 * runs inside one of these, because the whole point of the module is that the
 * answer must not depend on where the machine is standing.
 */
const REAL_TZ = process.env.TZ;
function withTZ(tz, fn) {
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (REAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = REAL_TZ;
  }
}
afterEach(() => {
  if (REAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = REAL_TZ;
});

// A spread of offsets: deep negative, US, UTC, half-hour positive, deep positive.
const ZONES = [
  'Etc/GMT+12',        // UTC-12, the earliest offset in use
  'America/Chicago',   // UTC-6 / -5
  'UTC',
  'Asia/Kolkata',      // UTC+5:30
  'Pacific/Kiritimati' // UTC+14, the latest
];

describe('toUtcMidnight', () => {
  it('reads a bare YYYY-MM-DD as the day it names, in every host timezone', () => {
    for (const tz of ZONES) {
      withTZ(tz, () => {
        expect(toUtcMidnight('2026-02-26').toISOString()).toBe('2026-02-26T00:00:00.000Z');
      });
    }
  });

  it('normalizes an instant to the UTC day it falls on', () => {
    // 23:00 America/Chicago on Feb 26 is already Feb 27 in UTC.
    expect(toUtcMidnight(new Date('2026-02-27T05:00:00.000Z')).toISOString())
      .toBe('2026-02-27T00:00:00.000Z');
    expect(toUtcMidnight('2026-02-26T23:59:59.999Z').toISOString())
      .toBe('2026-02-26T00:00:00.000Z');
  });

  it('is idempotent', () => {
    const once = toUtcMidnight('2026-02-26');
    expect(toUtcMidnight(once).toISOString()).toBe(once.toISOString());
  });

  it('survives a full ISO string with an offset', () => {
    // The naive `split('-')` implementations in fitnessgeek's logRoutes and
    // FoodLog produce an Invalid Date here; the regex guard does not.
    expect(toUtcMidnight('2026-02-26T10:00:00-06:00').toISOString())
      .toBe('2026-02-26T00:00:00.000Z');
  });

  it('handles leap day and year boundaries', () => {
    expect(toUtcMidnight('2024-02-29').toISOString()).toBe('2024-02-29T00:00:00.000Z');
    expect(toUtcMidnight('2025-12-31').toISOString()).toBe('2025-12-31T00:00:00.000Z');
    expect(toUtcMidnight('2026-01-01').toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('propagates an invalid date rather than inventing one', () => {
    expect(Number.isNaN(toUtcMidnight('not a date').getTime())).toBe(true);
  });
});

describe('utcMidnightToday', () => {
  it('is midnight UTC on the current UTC day, whatever the host timezone', () => {
    for (const tz of ZONES) {
      withTZ(tz, () => {
        const d = utcMidnightToday();
        expect(d.toISOString().endsWith('T00:00:00.000Z')).toBe(true);
        expect(utcDateString(d)).toBe(new Date().toISOString().slice(0, 10));
      });
    }
  });
});

describe('utcDayRange', () => {
  it('spans exactly one UTC day, inclusive', () => {
    const { start, end } = utcDayRange('2026-02-26');
    expect(start.toISOString()).toBe('2026-02-26T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-02-26T23:59:59.999Z');
    expect(end - start).toBe(86_400_000 - 1);
  });

  it('does not mutate the start when building the end', () => {
    const { start } = utcDayRange('2026-02-26');
    expect(start.getUTCHours()).toBe(0);
  });

  it('brackets a UTC-midnight record and excludes its neighbours', () => {
    const { start, end } = utcDayRange('2026-02-26');
    const stored = toUtcMidnight('2026-02-26');
    expect(stored >= start && stored <= end).toBe(true);
    expect(toUtcMidnight('2026-02-25') >= start).toBe(false);
    expect(toUtcMidnight('2026-02-27') <= end).toBe(false);
  });

  it('is host-timezone independent — the setHours() bug the spec names', () => {
    // `startDate.setHours(0,0,0,0)` gives the *server's* local day. That looks
    // right in a UTC container and breaks the moment a TZ is set.
    for (const tz of ZONES) {
      withTZ(tz, () => {
        expect(utcDayRange('2026-02-26').start.toISOString())
          .toBe('2026-02-26T00:00:00.000Z');
      });
    }
  });
});

describe('utcDateString', () => {
  it('round-trips a stored calendar date in every host timezone', () => {
    for (const tz of ZONES) {
      withTZ(tz, () => {
        expect(utcDateString('2026-02-26T00:00:00.000Z')).toBe('2026-02-26');
        expect(utcDateString(new Date(Date.UTC(2026, 1, 26)))).toBe('2026-02-26');
      });
    }
  });

  it('pads single-digit months and days', () => {
    expect(utcDateString('2026-01-05T00:00:00.000Z')).toBe('2026-01-05');
  });

  it('returns the empty string for missing or invalid input', () => {
    expect(utcDateString(null)).toBe('');
    expect(utcDateString(undefined)).toBe('');
    expect(utcDateString('')).toBe('');
    expect(utcDateString('nope')).toBe('');
  });
});

describe('displayCalendarDate', () => {
  it('fixes the off-by-one the spec names (Pattern 4)', () => {
    // Spec: `new Date("2026-02-26T00:00:00.000Z").toLocaleDateString()`
    // → "2/25/2026" in America/Chicago. Forcing UTC gives the real day.
    withTZ('America/Chicago', () => {
      const stored = '2026-02-26T00:00:00.000Z';
      expect(new Date(stored).toLocaleDateString('en-US')).toBe('2/25/2026'); // the bug
      expect(displayCalendarDate(stored, 'en-US')).toBe('2/26/2026');         // the fix
    });
  });

  it('renders the same day east and west of UTC', () => {
    for (const tz of ZONES) {
      withTZ(tz, () => {
        expect(displayCalendarDate('2026-02-26T00:00:00.000Z', 'en-US')).toBe('2/26/2026');
      });
    }
  });

  it('merges caller options but never lets them override the UTC timezone', () => {
    withTZ('America/Chicago', () => {
      expect(displayCalendarDate('2026-02-26T00:00:00.000Z', 'en-US', { month: 'short', day: 'numeric' }))
        .toBe('Feb 26');
      expect(displayCalendarDate('2026-02-26T00:00:00.000Z', 'en-US', { timeZone: 'America/Chicago' }))
        .toBe('2/26/2026');
    });
  });

  it('returns the empty string for missing or invalid input', () => {
    expect(displayCalendarDate(null)).toBe('');
    expect(displayCalendarDate('')).toBe('');
    expect(displayCalendarDate('nope')).toBe('');
  });
});

describe('localDateString', () => {
  it('keeps a late-evening instant on the user\'s own day (the spec\'s worked example)', () => {
    // 11pm CST on Feb 26 — already Feb 27 in UTC.
    const instant = new Date('2026-02-27T05:00:00.000Z');
    withTZ('America/Chicago', () => {
      expect(instant.toISOString().slice(0, 10)).toBe('2026-02-27'); // the bug
      expect(localDateString(instant)).toBe('2026-02-26');           // the fix
    });
  });

  it('keeps an early-morning instant on the user\'s own day east of UTC', () => {
    // 05:00 on Feb 26 in Kolkata is 23:30 Feb 25 in UTC.
    const instant = new Date('2026-02-25T23:30:00.000Z');
    withTZ('Asia/Kolkata', () => {
      expect(instant.toISOString().slice(0, 10)).toBe('2026-02-25'); // the bug
      expect(localDateString(instant)).toBe('2026-02-26');           // the fix
    });
  });

  it('fixes Pattern 3 — local midnight serialized through toISOString', () => {
    withTZ('Asia/Kolkata', () => {
      const localMidnight = new Date(2026, 1, 26);
      expect(localMidnight.toISOString().split('T')[0]).toBe('2026-02-25'); // the bug
      expect(localDateString(localMidnight)).toBe('2026-02-26');            // the fix
    });
  });

  it('holds at both midnight boundaries in a deep negative offset', () => {
    withTZ('Etc/GMT+12', () => {
      // 00:00:00.000 local on Feb 26 == 12:00 UTC Feb 26.
      expect(localDateString(new Date('2026-02-26T12:00:00.000Z'))).toBe('2026-02-26');
      // One millisecond earlier is still Feb 25 locally.
      expect(localDateString(new Date('2026-02-26T11:59:59.999Z'))).toBe('2026-02-25');
      // 23:59:59.999 local on Feb 26.
      expect(localDateString(new Date('2026-02-27T11:59:59.999Z'))).toBe('2026-02-26');
    });
  });

  it('holds at both midnight boundaries in a deep positive offset', () => {
    withTZ('Pacific/Kiritimati', () => {
      // UTC+14: local midnight Feb 26 == 10:00 UTC Feb 25.
      expect(localDateString(new Date('2026-02-25T10:00:00.000Z'))).toBe('2026-02-26');
      expect(localDateString(new Date('2026-02-25T09:59:59.999Z'))).toBe('2026-02-25');
      expect(localDateString(new Date('2026-02-26T09:59:59.999Z'))).toBe('2026-02-26');
    });
  });

  it('holds at the half-hour offset boundary', () => {
    withTZ('Asia/Kolkata', () => {
      // UTC+5:30: local midnight Feb 26 == 18:30 UTC Feb 25.
      expect(localDateString(new Date('2026-02-25T18:30:00.000Z'))).toBe('2026-02-26');
      expect(localDateString(new Date('2026-02-25T18:29:59.999Z'))).toBe('2026-02-25');
    });
  });

  it('does not skip or repeat a day across spring-forward', () => {
    // America/Chicago springs forward 2026-03-08 at 02:00 local (08:00 UTC).
    withTZ('America/Chicago', () => {
      expect(localDateString(new Date('2026-03-08T06:00:00.000Z'))).toBe('2026-03-08'); // 00:00 CST
      expect(localDateString(new Date('2026-03-08T07:59:59.999Z'))).toBe('2026-03-08'); // 01:59 CST
      expect(localDateString(new Date('2026-03-08T08:00:00.000Z'))).toBe('2026-03-08'); // 03:00 CDT
      expect(localDateString(new Date('2026-03-09T04:59:59.999Z'))).toBe('2026-03-08'); // 23:59 CDT
      expect(localDateString(new Date('2026-03-09T05:00:00.000Z'))).toBe('2026-03-09'); // 00:00 CDT
    });
  });

  it('does not skip or repeat a day across fall-back', () => {
    // America/Chicago falls back 2026-11-01 at 02:00 local (07:00 UTC).
    withTZ('America/Chicago', () => {
      expect(localDateString(new Date('2026-11-01T05:00:00.000Z'))).toBe('2026-11-01'); // 00:00 CDT
      expect(localDateString(new Date('2026-11-01T06:30:00.000Z'))).toBe('2026-11-01'); // 01:30 CDT
      expect(localDateString(new Date('2026-11-01T07:30:00.000Z'))).toBe('2026-11-01'); // 01:30 CST (repeated hour)
      expect(localDateString(new Date('2026-11-02T05:59:59.999Z'))).toBe('2026-11-01'); // 23:59 CST
      expect(localDateString(new Date('2026-11-02T06:00:00.000Z'))).toBe('2026-11-02');
    });
  });

  it('walks a whole DST-crossing week without dropping or doubling a date', () => {
    withTZ('America/Chicago', () => {
      const seen = [];
      // Noon local each day is unambiguous on both sides of the transition.
      for (let day = 5; day <= 12; day += 1) {
        seen.push(localDateString(new Date(2026, 2, day, 12, 0, 0)));
      }
      expect(seen).toEqual([
        '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08',
        '2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12',
      ]);
    });
  });

  it('defaults to now', () => {
    withTZ('America/Chicago', () => {
      const now = new Date();
      expect(localDateString()).toBe(
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      );
    });
  });

  it('accepts a string or a timestamp', () => {
    withTZ('UTC', () => {
      expect(localDateString('2026-02-26T12:00:00.000Z')).toBe('2026-02-26');
      expect(localDateString(Date.UTC(2026, 1, 26, 12))).toBe('2026-02-26');
    });
  });

  it('returns the empty string for missing or invalid input', () => {
    expect(localDateString(null)).toBe('');
    expect(localDateString('')).toBe('');
    expect(localDateString('nope')).toBe('');
  });

  it('disagrees with utcDateString exactly where it should', () => {
    // The same instant, two legitimate answers. Calling the wrong one is the
    // bug; having only one of them is why the bug kept happening.
    const instant = new Date('2026-02-27T05:00:00.000Z');
    withTZ('America/Chicago', () => {
      expect(localDateString(instant)).toBe('2026-02-26');
      expect(utcDateString(instant)).toBe('2026-02-27');
    });
  });
});

describe('startOfLocalDay', () => {
  it('is local midnight, not UTC midnight', () => {
    withTZ('America/Chicago', () => {
      expect(startOfLocalDay(new Date('2026-02-26T18:30:00.000Z')).toISOString())
        .toBe('2026-02-26T06:00:00.000Z'); // 00:00 CST
    });
    withTZ('Asia/Kolkata', () => {
      expect(startOfLocalDay(new Date('2026-02-26T18:30:00.000Z')).toISOString())
        .toBe('2026-02-26T18:30:00.000Z'); // 00:00 IST on Feb 27 — the same instant
    });
  });

  it('does not mutate its argument', () => {
    const original = new Date('2026-02-26T18:30:00.000Z');
    const copy = original.toISOString();
    startOfLocalDay(original);
    expect(original.toISOString()).toBe(copy);
  });

  it('lands on the same local day it was given, across DST', () => {
    withTZ('America/Chicago', () => {
      // Spring-forward day: midnight exists, the 2am hour does not.
      const springForward = startOfLocalDay(new Date('2026-03-08T18:00:00.000Z'));
      expect(localDateString(springForward)).toBe('2026-03-08');
      expect(springForward.toISOString()).toBe('2026-03-08T06:00:00.000Z');

      // Fall-back day: 25 hours long.
      const fallBack = startOfLocalDay(new Date('2026-11-01T18:00:00.000Z'));
      expect(localDateString(fallBack)).toBe('2026-11-01');
      expect(fallBack.toISOString()).toBe('2026-11-01T05:00:00.000Z');
    });
  });

  it('gives a whole-day difference for a day-count across DST', () => {
    // The carried-over/days-since arithmetic in bujogeek and flockgeek rounds,
    // precisely because a DST day is 23 or 25 hours long.
    withTZ('America/Chicago', () => {
      const a = startOfLocalDay(new Date(2026, 2, 6, 9));  // Mar 6
      const b = startOfLocalDay(new Date(2026, 2, 10, 9)); // Mar 10, DST between
      expect(Math.round((b - a) / 86_400_000)).toBe(4);
      expect(Math.floor((b - a) / 86_400_000)).toBe(3);    // why round(), not floor()
    });
  });

  it('defaults to now', () => {
    withTZ('America/Chicago', () => {
      const d = startOfLocalDay();
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
      expect(d.getSeconds()).toBe(0);
      expect(d.getMilliseconds()).toBe(0);
    });
  });
});
