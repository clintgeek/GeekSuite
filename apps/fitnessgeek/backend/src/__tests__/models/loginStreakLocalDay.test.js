/**
 * The streak, pinned against a real evening.
 *
 * The containers run UTC (`DOCS/THE_CONTEXT.md` 3.1), so the old
 * `new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))` read
 * the SERVER's day, not the user's. The module's own comment claimed the
 * opposite and warned against "simplifying" it — which is why it survived.
 *
 * Every instant below is written as the UTC equivalent of a US-Central wall
 * clock, with the Central time in the name, because that difference IS the bug.
 */
import { applyLoginToStreak } from '@geeksuite/schemas/fitnessgeek/loginStreak';

const fresh = () => ({
  current_streak: 0,
  longest_streak: 0,
  last_login_date: null,
  streak_start_date: null,
});

// 2026-09-14 is a Monday.
const MON_MORNING = { iso: '2026-09-14T15:00:00.000Z', local: '2026-09-14' }; // 10:00 CDT
const TUE_EVENING = { iso: '2026-09-16T02:00:00.000Z', local: '2026-09-15' }; // 21:00 CDT Tue
const WED_MORNING = { iso: '2026-09-16T15:00:00.000Z', local: '2026-09-16' }; // 10:00 CDT Wed

const login = (streak, day) => applyLoginToStreak(streak, new Date(day.iso), day.local);

describe('three consecutive days, one of them an evening', () => {
  test('counts 1, 2, 3 — it used to count 1, 1, 1', () => {
    const s = fresh();

    login(s, MON_MORNING);
    expect(s.current_streak).toBe(1);

    // The evening login. In UTC this instant is already Wednesday, so the old
    // code saw "today = Wed", "yesterday = Tue", "lastLogin = Mon" — no branch
    // matched and the streak RESET to 1.
    login(s, TUE_EVENING);
    expect(s.current_streak).toBe(2);

    // And the next morning was the same UTC day as that evening, so the old
    // code incremented nothing.
    login(s, WED_MORNING);
    expect(s.current_streak).toBe(3);
  });

  test('the result no longer depends on the server\'s timezone', () => {
    // WHY THIS SUITE NEVER CAUGHT THE BUG.
    //
    // The old code read `now.getFullYear/getMonth/getDate` — the PROCESS's
    // local fields. This suite runs on a developer machine in US-Central,
    // where those fields are the user's day and the old code is therefore
    // CORRECT. In the container, which runs UTC, they are the UTC day and it
    // is wrong. The same function, passing here and failing in production,
    // decided by an environment variable.
    //
    // So the property worth pinning is not "the old way returns 1" (it does
    // not, here) but that the new way is INDEPENDENT of the process zone:
    // any instant on the user's 2026-09-15 must count as that one day.
    const early = fresh();
    login(early, MON_MORNING);
    applyLoginToStreak(early, new Date('2026-09-15T13:00:00.000Z'), '2026-09-15'); // 08:00 CDT

    const late = fresh();
    login(late, MON_MORNING);
    applyLoginToStreak(late, new Date('2026-09-16T02:00:00.000Z'), '2026-09-15'); // 21:00 CDT

    // Same local day, instants on opposite sides of UTC midnight.
    expect(early.current_streak).toBe(2);
    expect(late.current_streak).toBe(2);
    expect(late.last_login_date.toISOString()).toBe(early.last_login_date.toISOString());
  });
});

describe('a skipped day breaks the streak', () => {
  test('Monday evening then Wednesday does NOT count as consecutive', () => {
    // The mirror bug: a Monday-evening login was recorded as Tuesday, so
    // skipping Tuesday entirely still incremented.
    const s = fresh();
    login(s, { iso: '2026-09-15T02:00:00.000Z', local: '2026-09-14' }); // Mon 21:00 CDT
    expect(s.current_streak).toBe(1);

    login(s, WED_MORNING); // Tuesday never happened
    expect(s.current_streak).toBe(1); // reset, not 2
  });
});

describe('the ordinary branches still hold', () => {
  test('a second login the same local day changes nothing', () => {
    const s = fresh();
    login(s, MON_MORNING);
    login(s, { iso: '2026-09-15T01:00:00.000Z', local: '2026-09-14' }); // 20:00 CDT, same day
    expect(s.current_streak).toBe(1);
  });

  test('longest_streak keeps the high-water mark across a reset', () => {
    const s = fresh();
    login(s, MON_MORNING);
    login(s, TUE_EVENING);
    login(s, WED_MORNING);
    expect(s.longest_streak).toBe(3);

    login(s, { iso: '2026-09-25T15:00:00.000Z', local: '2026-09-25' }); // a week later
    expect(s.current_streak).toBe(1);
    expect(s.longest_streak).toBe(3);
  });

  test('last_login_date is stored at UTC midnight of the USER\'s day', () => {
    const s = fresh();
    login(s, TUE_EVENING);
    expect(s.last_login_date.toISOString()).toBe('2026-09-15T00:00:00.000Z');
  });

  test('a malformed local date falls back rather than throwing', () => {
    const s = fresh();
    applyLoginToStreak(s, new Date(MON_MORNING.iso), 'not-a-date');
    expect(s.current_streak).toBe(1);
    expect(s.last_login_date).toBeInstanceOf(Date);
  });
});
