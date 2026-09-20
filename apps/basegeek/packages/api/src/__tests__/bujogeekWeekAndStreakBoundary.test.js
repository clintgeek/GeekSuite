/**
 * Two day-boundary fixes, pinned.
 *
 * 1. The weekly log view snapped to SUNDAY while `WeeklySpread` renders Monday
 *    to Sunday, so the Sunday column the UI drew was outside the window the
 *    gateway returned and could never contain anything.
 * 2. `currentStreak` fell back to the SERVER's UTC day, and the containers run
 *    UTC — so the "today is still open" grace was granted to UTC's today and
 *    the user's own today counted as a missed day.
 *
 * Both are timezone bugs that a suite running in US-Central can mask, so these
 * assert against explicit UTC instants rather than "now".
 */
import { jest } from '@jest/globals';
import taskService from '../graphql/bujogeek/services/taskService.js';
import habitService from '../graphql/bujogeek/services/habitService.js';

const iso = (d) => d.toISOString();

describe('startOfUtcWeek — the app\'s week starts on Monday', () => {
  // 2026-09-14 is a Monday, 2026-09-20 the Sunday that closes that week.
  test.each([
    ['Monday', '2026-09-14T00:00:00.000Z'],
    ['Wednesday', '2026-09-16T12:00:00.000Z'],
    ['Saturday', '2026-09-19T23:00:00.000Z'],
    ['Sunday', '2026-09-20T18:00:00.000Z'],
  ])('a %s resolves back to Monday 2026-09-14', (_label, instant) => {
    expect(iso(taskService.startOfUtcWeek(new Date(instant)))).toBe('2026-09-14T00:00:00.000Z');
  });

  test('a Sunday does NOT start its own week — that was the bug', () => {
    // The old `- getUTCDay()` returned the Sunday itself, one day ahead of the
    // Monday the UI had computed and handed over.
    const sunday = new Date('2026-09-20T00:00:00.000Z');
    expect(iso(taskService.startOfUtcWeek(sunday))).not.toBe('2026-09-20T00:00:00.000Z');
    expect(iso(taskService.startOfUtcWeek(sunday))).toBe('2026-09-14T00:00:00.000Z');
  });

  test('the week closes on the Sunday the UI renders last', () => {
    const start = taskService.startOfUtcWeek(new Date('2026-09-16T00:00:00.000Z'));
    expect(iso(taskService.endOfUtcWeek(start))).toBe('2026-09-20T23:59:59.999Z');
  });

  test('the window is exactly seven days', () => {
    const start = taskService.startOfUtcWeek(new Date('2026-09-16T00:00:00.000Z'));
    const end = taskService.endOfUtcWeek(start);
    const days = (end.getTime() - start.getTime() + 1) / 86400000;
    expect(days).toBe(7);
  });

  test('crosses a month boundary correctly', () => {
    // Thu 2026-10-01 belongs to the week starting Mon 2026-09-28.
    expect(iso(taskService.startOfUtcWeek(new Date('2026-10-01T00:00:00.000Z'))))
      .toBe('2026-09-28T00:00:00.000Z');
  });

  test('the Sunday the UI draws is inside the window the gateway builds', () => {
    // The whole point: WeeklySpread renders Mon..Sun from a Monday, and that
    // Sunday must be fetchable. It was not.
    const uiMonday = new Date('2026-09-14T00:00:00.000Z');
    const uiSunday = new Date('2026-09-20T12:00:00.000Z');
    const start = taskService.startOfUtcWeek(uiMonday);
    const end = taskService.endOfUtcWeek(start);
    expect(uiSunday >= start && uiSunday <= end).toBe(true);
  });
});

describe('getCurrentStreak honours the caller\'s day, not the server\'s', () => {
  // Logged every day 2026-09-01 .. 2026-09-19. 09-20 is the user's today and
  // is not logged yet — which is the ordinary state of an evening.
  const logged = [];
  for (let d = 1; d <= 19; d += 1) {
    logged.push({ date: new Date(Date.UTC(2026, 8, d)) });
  }

  const habit = { _id: '507f1f77bcf86cd799439011', daysOfWeek: [] }; // empty = daily

  test('the user\'s day and the server\'s UTC day give different answers', async () => {
    // THE BUG, stated directly. At 9pm US-Central the UTC day has already
    // rolled to the 21st, and that is the day the resolver used to pass. The
    // user's real answer is 19; the server's was 0 — same data, same moment.
    const HabitLog = (await import('../graphql/bujogeek/models/HabitLog.js')).default;
    const spy = jest.spyOn(HabitLog, 'find').mockReturnValue({
      select: () => Promise.resolve(logged),
    });
    const Habit = (await import('../graphql/bujogeek/models/Habit.js')).default;
    jest.spyOn(Habit, 'findOne').mockReturnValue({ select: () => Promise.resolve(habit) });

    const usersDay = await habitService.getCurrentStreak(habit, 'u1', '2026-09-20');
    const serversUtcDay = await habitService.getCurrentStreak(habit, 'u1', '2026-09-21');

    expect(usersDay).toBe(19);
    expect(serversUtcDay).toBe(0);
    expect(usersDay).not.toBe(serversUtcDay);

    spy.mockRestore();
  });

  test('the user\'s today being unlogged does not break the streak', async () => {
    const HabitLog = (await import('../graphql/bujogeek/models/HabitLog.js')).default;
    const spy = jest.spyOn(HabitLog, 'find').mockReturnValue({
      select: () => Promise.resolve(logged),
    });
    const Habit = (await import('../graphql/bujogeek/models/Habit.js')).default;
    jest.spyOn(Habit, 'findOne').mockReturnValue({ select: () => Promise.resolve(habit) });

    // Today is still open — the grace should apply to the USER's today.
    expect(await habitService.getCurrentStreak(habit, 'u1', '2026-09-20')).toBe(19);
    // And the day after the streak genuinely lapsed, it is gone.
    expect(await habitService.getCurrentStreak(habit, 'u1', '2026-09-21')).toBe(0);

    spy.mockRestore();
  });
});
