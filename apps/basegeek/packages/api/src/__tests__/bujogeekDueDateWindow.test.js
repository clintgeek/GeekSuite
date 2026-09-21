/**
 * The headline bug from DOCS/BUJOGEEK_REVIEW_2026-09.md §1.1: anything due
 * after 19:00 US-Central landed on the wrong day.
 *
 * `dueDate` carries two kinds of value and the convention tells them apart —
 * UTC midnight exactly is a DATE, anything else is an INSTANT. The log views
 * used one UTC-day range for both, which is right for the first and wrong for
 * the second.
 *
 * These assert the clause itself against explicit instants. The predicate is
 * evaluated here the way Mongo would, because the alternative is a database
 * round trip to test arithmetic.
 */
import taskService from '../graphql/bujogeek/services/taskService.js';

const CDT_OFFSET = 300; // US-Central summer, JS sign: minutes west of UTC
const utcMidnight = (day) => new Date(`${day}T00:00:00.000Z`);

/** Evaluate the clause the way Mongo would, for one candidate dueDate. */
function matches(clause, dueDate) {
  const inRange = (cond, value) => {
    if (cond.$in) return cond.$in.some((d) => d.getTime() === value.getTime());
    if (cond.$ne && cond.$ne.getTime() === value.getTime()) return false;
    if (cond.$nin && cond.$nin.some((d) => d.getTime() === value.getTime())) return false;
    if (cond.$gte && value < cond.$gte) return false;
    if (cond.$lte && value > cond.$lte) return false;
    return true;
  };
  if (clause.$or) return clause.$or.some((c) => inRange(c.dueDate, dueDate));
  return inRange(clause.dueDate, dueDate);
}

describe('a single day, for a caller in US-Central', () => {
  const clause = taskService.dueDateClauseForDays(
    utcMidnight('2026-09-20'),
    utcMidnight('2026-09-20'),
    CDT_OFFSET
  );

  it('includes a task due 8pm that evening — the bug', () => {
    // Stored 01:00Z on the 21st. It used to fall outside the 20th's UTC day
    // and show up on the 21st's page instead.
    expect(matches(clause, new Date('2026-09-21T01:00:00.000Z'))).toBe(true);
  });

  it('includes a task due 11:30pm that evening', () => {
    expect(matches(clause, new Date('2026-09-21T04:30:00.000Z'))).toBe(true);
  });

  it('includes a task due 6am that morning', () => {
    // The case that always worked; it must keep working.
    expect(matches(clause, new Date('2026-09-20T11:00:00.000Z'))).toBe(true);
  });

  it('includes a date-only task for that day', () => {
    expect(matches(clause, utcMidnight('2026-09-20'))).toBe(true);
  });

  it('EXCLUDES the next day\'s date-only task — the trap in the naive fix', () => {
    // 2026-09-21T00:00Z sits inside the 20th's LOCAL window for anyone west
    // of UTC. Swapping the UTC window for the local one would have dragged
    // every one of tomorrow's undated tasks onto today.
    expect(matches(clause, utcMidnight('2026-09-21'))).toBe(false);
  });

  it('excludes the previous day\'s date-only task', () => {
    expect(matches(clause, utcMidnight('2026-09-19'))).toBe(false);
  });

  it('excludes a task due 8pm the PREVIOUS evening', () => {
    expect(matches(clause, new Date('2026-09-20T01:00:00.000Z'))).toBe(false);
  });

  it('excludes a task due 8pm the NEXT evening', () => {
    expect(matches(clause, new Date('2026-09-22T01:00:00.000Z'))).toBe(false);
  });

  it('includes midnight-to-1am local, which is the next UTC day', () => {
    // 00:30 local on the 20th is 05:30Z on the 20th — inside both readings.
    expect(matches(clause, new Date('2026-09-20T05:30:00.000Z'))).toBe(true);
  });
});

describe('winter, when the offset changes', () => {
  const CST_OFFSET = 360;
  const clause = taskService.dueDateClauseForDays(
    utcMidnight('2026-12-15'),
    utcMidnight('2026-12-15'),
    CST_OFFSET
  );

  it('includes a 7pm task in CST — the threshold moves with the offset', () => {
    // 19:00 CST is 01:00Z the next day. The browser supplies the offset for
    // the requested date, so DST is its problem, not the server's.
    expect(matches(clause, new Date('2026-12-16T01:00:00.000Z'))).toBe(true);
  });

  it('still excludes the next day\'s date-only task', () => {
    expect(matches(clause, utcMidnight('2026-12-16'))).toBe(false);
  });
});

describe('a caller east of UTC', () => {
  const BERLIN_SUMMER = -120; // east of UTC is negative in JS
  const clause = taskService.dueDateClauseForDays(
    utcMidnight('2026-09-20'),
    utcMidnight('2026-09-20'),
    BERLIN_SUMMER
  );

  it('includes a task due 1am local, which is the previous UTC day', () => {
    // 01:00 on the 20th in Berlin is 23:00Z on the 19th.
    expect(matches(clause, new Date('2026-09-19T23:00:00.000Z'))).toBe(true);
  });

  it('includes the day\'s own date-only task', () => {
    expect(matches(clause, utcMidnight('2026-09-20'))).toBe(true);
  });

  it('excludes a task due 23:00 local, which is 21:00Z the same day', () => {
    // Inside the day either way — a sanity check that east-of-UTC is not
    // accidentally inverted.
    expect(matches(clause, new Date('2026-09-20T21:00:00.000Z'))).toBe(true);
  });
});

describe('a multi-day span', () => {
  const clause = taskService.dueDateClauseForDays(
    utcMidnight('2026-09-14'),
    utcMidnight('2026-09-20'),
    CDT_OFFSET
  );

  it('enumerates every date-only day in the span', () => {
    for (const day of ['2026-09-14', '2026-09-17', '2026-09-20']) {
      expect(matches(clause, utcMidnight(day))).toBe(true);
    }
  });

  it('excludes the date-only day just outside each end', () => {
    expect(matches(clause, utcMidnight('2026-09-13'))).toBe(false);
    expect(matches(clause, utcMidnight('2026-09-21'))).toBe(false);
  });

  it('includes an evening task on the last day of the span', () => {
    // Sunday 8pm Central = 01:00Z Monday, outside the span's UTC range.
    expect(matches(clause, new Date('2026-09-21T01:00:00.000Z'))).toBe(true);
  });
});

describe('no offset supplied', () => {
  const clause = taskService.dueDateClauseForDays(
    utcMidnight('2026-09-20'),
    utcMidnight('2026-09-20'),
    null
  );

  it('falls back to the old UTC-day behaviour, unchanged', () => {
    // A caller that does not say where it is must behave exactly as before,
    // which is what makes this safe for anything not updated.
    expect(clause.$or).toBeUndefined();
    expect(matches(clause, utcMidnight('2026-09-20'))).toBe(true);
    expect(matches(clause, new Date('2026-09-20T23:00:00.000Z'))).toBe(true);
    expect(matches(clause, new Date('2026-09-21T01:00:00.000Z'))).toBe(false);
  });
});
